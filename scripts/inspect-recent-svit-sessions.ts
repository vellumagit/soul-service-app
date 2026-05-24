// Show every recent session row for Svitlana with its key fields, sorted by
// creation time. We're hunting for duplicates from button-mashing and for
// what Google-sync state each one ended up in.
import "./_load-env";
import { db } from "@/db";
import { sessions, clients, accounts } from "@/db/schema";
import { sql, eq, and } from "drizzle-orm";

async function main() {
  const [svit] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, "solutions.by.svit@gmail.com"));
  if (!svit) return console.log("not found");

  const rows = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      scheduledAt: sessions.scheduledAt,
      type: sessions.type,
      status: sessions.status,
      clientName: clients.fullName,
      googleEventId: sessions.googleEventId,
      meetUrl: sessions.meetUrl,
      intention: sessions.intention,
      notes: sessions.notes,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(eq(sessions.accountId, svit.id))
    .orderBy(sql`${sessions.createdAt} desc`)
    .limit(20);

  console.log(`Last ${rows.length} sessions:\n`);
  for (const s of rows) {
    const created = s.createdAt.toISOString();
    const scheduled = s.scheduledAt.toISOString();
    console.log(
      `  created ${created}  scheduled ${scheduled}  ${s.type.padEnd(30)}  ${s.status.padEnd(10)}  ${s.clientName.padEnd(20)}  gevent:${s.googleEventId ? "✓" : "✗"}  meet:${s.meetUrl ? "✓" : "✗"}  notes:${s.notes ? s.notes.length + "ch" : "—"}`
    );
  }

  // Group by exact-second scheduledAt to spot dupes
  console.log(`\nGrouping by scheduledAt (looking for duplicate intentions):`);
  const groups = await db
    .select({
      scheduledAt: sessions.scheduledAt,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(sessions)
    .where(eq(sessions.accountId, svit.id))
    .groupBy(sessions.scheduledAt)
    .having(sql`count(*) > 1`);
  for (const g of groups) {
    console.log(`  ${g.scheduledAt.toISOString()} → ${g.n} sessions`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
