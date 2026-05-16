// DESTRUCTIVE — collapses duplicate sessions for a single client.
//
// "Duplicate" definition: same accountId + clientId + scheduledAt (down to the
// second). Within each duplicate group we KEEP the oldest row (the first one
// she submitted) and DELETE the rest. The kept row preserves whatever notes,
// payment state, etc. she added to it.
//
// SAFETY GUARDS:
// 1. Defaults to DRY RUN. Pass --apply to actually delete.
// 2. Skips groups where any duplicate has notes, intention, paid=true, or
//    invoice attached — those would be silently losing data. They get printed
//    for manual review instead.
// 3. Prints a full report before doing anything.
import "./_load-env";
import { db } from "@/db";
import { sessions, clients, accounts } from "@/db/schema";
import { and, eq, sql, inArray } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "\n[APPLY MODE — will delete rows]\n" : "\n[DRY RUN — no changes]\n");

  // Group sessions by (accountId, clientId, scheduledAt). Anything with count > 1
  // is a candidate for dedup.
  const groups = await db
    .select({
      accountId: sessions.accountId,
      clientId: sessions.clientId,
      scheduledAt: sessions.scheduledAt,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(sessions)
    .groupBy(sessions.accountId, sessions.clientId, sessions.scheduledAt)
    .having(sql`count(*) > 1`)
    .orderBy(sql`count(*) desc`);

  if (groups.length === 0) {
    console.log("No duplicate session groups found. Nothing to do.");
    return;
  }

  console.log(`Found ${groups.length} duplicate group(s):\n`);

  let totalDeletable = 0;
  let totalManualReview = 0;
  const idsToDelete: string[] = [];

  for (const g of groups) {
    // Fetch all rows in this group, oldest first
    const rows = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.accountId, g.accountId),
          eq(sessions.clientId, g.clientId),
          eq(sessions.scheduledAt, g.scheduledAt)
        )
      )
      .orderBy(sessions.createdAt);

    // Identify the client + account
    const [client] = await db
      .select({ fullName: clients.fullName })
      .from(clients)
      .where(eq(clients.id, g.clientId));
    const [acct] = await db
      .select({ email: accounts.email })
      .from(accounts)
      .where(eq(accounts.id, g.accountId));

    console.log(
      `  ${acct?.email ?? "?"} → ${client?.fullName ?? "?"} @ ${g.scheduledAt.toISOString()} — ${rows.length} rows`
    );

    // The keeper is the oldest row.
    const keeper = rows[0];
    const dupes = rows.slice(1);

    // For each duplicate, check whether it has data we'd lose by deleting.
    const safeToDelete: typeof rows = [];
    const needsReview: typeof rows = [];

    for (const dupe of dupes) {
      const hasData =
        (dupe.notes && dupe.notes.trim().length > 0) ||
        (dupe.intention && dupe.intention.trim().length > 0) ||
        dupe.paid ||
        dupe.invoiceUrl ||
        (dupe.arrivedAs && dupe.arrivedAs.trim().length > 0) ||
        (dupe.leftAs && dupe.leftAs.trim().length > 0);
      if (hasData) needsReview.push(dupe);
      else safeToDelete.push(dupe);
    }

    console.log(
      `    ★ KEEP  ${keeper.id.slice(0, 8)}… (oldest, ${keeper.status}, created ${keeper.createdAt.toISOString()})`
    );
    for (const d of safeToDelete) {
      console.log(
        `      drop  ${d.id.slice(0, 8)}… (${d.status}, created ${d.createdAt.toISOString()}, empty)`
      );
      idsToDelete.push(d.id);
      totalDeletable++;
    }
    for (const d of needsReview) {
      console.log(
        `      ⚠ MANUAL  ${d.id.slice(0, 8)}… (${d.status}, has data — paid=${d.paid}, notes=${(d.notes ?? "").length}ch)`
      );
      totalManualReview++;
    }
    console.log();
  }

  console.log(
    `Summary: ${totalDeletable} duplicate rows safe to delete, ${totalManualReview} need manual review.\n`
  );

  if (!APPLY) {
    console.log("DRY RUN — nothing was deleted. Re-run with --apply to delete.");
    return;
  }

  if (idsToDelete.length === 0) {
    console.log("Nothing to delete after safety checks.");
    return;
  }

  console.log(`Deleting ${idsToDelete.length} rows…`);
  const result = await db
    .delete(sessions)
    .where(inArray(sessions.id, idsToDelete));
  console.log(`Done. Result: ${JSON.stringify(result)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
