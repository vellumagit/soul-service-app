// Diagnostic — read-only. Finds clients that look like duplicates of each other
// within the same account: same fullName (case/whitespace-normalized), grouped
// to show how many copies exist and which one was created first.
//
// Usage:
//   npx tsx scripts/find-duplicate-clients.ts
//
// Nothing is deleted. To clean up, see scripts/delete-duplicate-clients.ts.
// Load .env.local before any module that reads process.env.DATABASE_URL.
// Top-level imports are hoisted, so we do this in a separate file that we
// import first — see ./_load-env.ts.
import "./_load-env";
import { db } from "@/db";
import { clients, sessions, tasks, attachments, goals } from "@/db/schema";
import { sql, eq, and } from "drizzle-orm";

async function main() {
  // Group by (accountId, lower(trim(fullName))) and count.
  const rows = await db
    .select({
      accountId: clients.accountId,
      normalizedName: sql<string>`lower(trim(${clients.fullName}))`.as("nn"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(clients)
    .groupBy(clients.accountId, sql`lower(trim(${clients.fullName}))`)
    .having(sql`count(*) > 1`)
    .orderBy(sql`count(*) desc`);

  if (rows.length === 0) {
    console.log("No duplicate client names found. You're clean.");
    return;
  }

  console.log(`\nFound ${rows.length} duplicate name group(s):\n`);

  for (const group of rows) {
    console.log(
      `  ${group.normalizedName} (account ${group.accountId.slice(0, 8)}…) — ${group.count} rows`
    );

    // Pull every row for this group, sorted oldest first (the keeper is the oldest).
    const allCopies = await db
      .select({
        id: clients.id,
        fullName: clients.fullName,
        createdAt: clients.createdAt,
        email: clients.email,
        status: clients.status,
      })
      .from(clients)
      .where(
        and(
          eq(clients.accountId, group.accountId),
          sql`lower(trim(${clients.fullName})) = ${group.normalizedName}`
        )
      )
      .orderBy(clients.createdAt);

    for (let i = 0; i < allCopies.length; i++) {
      const c = allCopies[i];
      // For each copy, count attached sessions/tasks/files so we know which has data
      const [sessionCount] = await db
        .select({ n: sql<number>`count(*)`.as("n") })
        .from(sessions)
        .where(eq(sessions.clientId, c.id));
      const [taskCount] = await db
        .select({ n: sql<number>`count(*)`.as("n") })
        .from(tasks)
        .where(eq(tasks.clientId, c.id));
      const [fileCount] = await db
        .select({ n: sql<number>`count(*)`.as("n") })
        .from(attachments)
        .where(eq(attachments.clientId, c.id));
      const [goalCount] = await db
        .select({ n: sql<number>`count(*)`.as("n") })
        .from(goals)
        .where(eq(goals.clientId, c.id));

      const isKeeper = i === 0;
      const marker = isKeeper ? "★ KEEP " : "  drop ";
      const data =
        Number(sessionCount.n) +
          Number(taskCount.n) +
          Number(fileCount.n) +
          Number(goalCount.n) >
        0
          ? `[sessions:${sessionCount.n} tasks:${taskCount.n} files:${fileCount.n} goals:${goalCount.n}]`
          : "(empty)";

      console.log(
        `    ${marker}${c.id.slice(0, 8)}… created ${c.createdAt.toISOString()} ${data}`
      );
    }
    console.log();
  }

  console.log(
    "Keeper = oldest row in each group. The dud-button bug created duplicates"
  );
  console.log("with no attached data, so they're safe to delete.\n");
  console.log(
    "To delete the dupes (DESTRUCTIVE), run: npx tsx scripts/delete-duplicate-clients.ts"
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
