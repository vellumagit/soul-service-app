// Simulates: createClient → immediately fetch via getClientFile pattern.
// If the inserted row is gone or invisible, we'd see it here. Cleans up after.
import "./_load-env";
import { db } from "@/db";
import { clients, accounts, sessions, tasks } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const targetEmail = process.argv[2] ?? "solutions.by.svit@gmail.com";

async function main() {
  const [acct] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, targetEmail));
  if (!acct) {
    console.error(`Account ${targetEmail} not found.`);
    process.exit(1);
  }
  console.log(`\nAccount: ${acct.email} (${acct.id})\n`);

  const probeName = `[PROBE ${Date.now()}]`;
  console.log(`Inserting probe client "${probeName}"…`);

  const [created] = await db
    .insert(clients)
    .values({
      accountId: acct.id,
      fullName: probeName,
      primarySessionType: "Session",
      tags: [],
      sensitivities: [],
      status: "active",
    })
    .returning({ id: clients.id });

  console.log(`  ✓ inserted, id=${created.id}`);

  // Now do the exact query the page does
  console.log(`\nFetching via getClientById pattern…`);
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.accountId, acct.id), eq(clients.id, created.id)))
    .limit(1);

  if (rows.length === 0) {
    console.log("  ✗ FAILED — row not found by (accountId, id) filter!");
    console.log("  This would cause /clients/<id> → notFound() → 404.");
  } else {
    console.log("  ✓ found:", rows[0].fullName);
  }

  // Also try without the accountId filter, to see if it exists at all
  const universal = await db
    .select()
    .from(clients)
    .where(eq(clients.id, created.id))
    .limit(1);
  console.log(
    `  Universal lookup (no accountId filter): ${universal.length === 1 ? "found" : "missing"}`
  );
  if (universal[0]) {
    console.log(`    fullName: ${universal[0].fullName}`);
    console.log(`    accountId: ${universal[0].accountId}`);
    console.log(`    expected:  ${acct.id}`);
    console.log(
      `    match:     ${universal[0].accountId === acct.id ? "yes" : "NO — accountId mismatch!"}`
    );
  }

  // Clean up — delete the probe row and any sessions/tasks it spawned
  console.log(`\nCleaning up…`);
  await db.delete(tasks).where(eq(tasks.clientId, created.id));
  await db.delete(sessions).where(eq(sessions.clientId, created.id));
  await db.delete(clients).where(eq(clients.id, created.id));
  console.log("  ✓ probe row deleted");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
