// Read-only diagnostic — lists every client row across every account, sorted
// by created date. Shows attached counts so we can spot suspicious clusters
// (e.g., 40 tasks for one client, or 8 clients added in the same minute).
import "./_load-env";
import { db } from "@/db";
import { clients, sessions, tasks, accounts } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

async function main() {
  // List accounts so we know who's who
  const allAccounts = await db
    .select({ id: accounts.id, email: accounts.email })
    .from(accounts);
  console.log("\nAccounts:");
  for (const a of allAccounts) {
    console.log(`  ${a.id.slice(0, 8)}… → ${a.email}`);
  }

  // All clients, newest first
  const allClients = await db
    .select({
      id: clients.id,
      accountId: clients.accountId,
      fullName: clients.fullName,
      createdAt: clients.createdAt,
      email: clients.email,
    })
    .from(clients)
    .orderBy(sql`${clients.createdAt} desc`);

  console.log(`\nTotal clients: ${allClients.length}\n`);

  // For each, count children
  for (const c of allClients) {
    const accountEmail =
      allAccounts.find((a) => a.id === c.accountId)?.email ?? "?";
    const [sessionCount] = await db
      .select({ n: sql<number>`count(*)`.as("n") })
      .from(sessions)
      .where(eq(sessions.clientId, c.id));
    const [taskCount] = await db
      .select({ n: sql<number>`count(*)`.as("n") })
      .from(tasks)
      .where(eq(tasks.clientId, c.id));

    console.log(
      `  ${c.createdAt.toISOString()}  [${accountEmail.padEnd(28)}]  ${c.fullName.padEnd(30)}  sessions:${String(sessionCount.n).padStart(3)}  tasks:${String(taskCount.n).padStart(3)}  id:${c.id.slice(0, 8)}…`
    );
  }

  // Now total session + task counts per account so we can spot clusters
  console.log("\nTotals per account:");
  for (const a of allAccounts) {
    const [cc] = await db
      .select({ n: sql<number>`count(*)`.as("n") })
      .from(clients)
      .where(eq(clients.accountId, a.id));
    const [sc] = await db
      .select({ n: sql<number>`count(*)`.as("n") })
      .from(sessions)
      .where(eq(sessions.accountId, a.id));
    const [tc] = await db
      .select({ n: sql<number>`count(*)`.as("n") })
      .from(tasks)
      .where(eq(tasks.accountId, a.id));
    console.log(
      `  ${a.email.padEnd(28)}  clients:${cc.n}  sessions:${sc.n}  tasks:${tc.n}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
