// Read-only — pulls every session for the Vlado client (Svitlana's account)
// and shows what they look like. Want to know: are they one series? Multiple
// series? Were they created in bursts (suggesting the dud-button bug)?
import "./_load-env";
import { db } from "@/db";
import { clients, sessions, sessionSeries } from "@/db/schema";
import { sql, eq, and } from "drizzle-orm";

async function main() {
  // Find Vlado
  const [vlado] = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      accountId: clients.accountId,
    })
    .from(clients)
    .where(sql`lower(${clients.fullName}) like '%vlado%'`);

  if (!vlado) {
    console.log("Couldn't find a client named Vlado.");
    return;
  }

  console.log(`\nClient: ${vlado.fullName} (id ${vlado.id.slice(0, 8)}…)\n`);

  const all = await db
    .select()
    .from(sessions)
    .where(eq(sessions.clientId, vlado.id))
    .orderBy(sessions.createdAt);

  console.log(`${all.length} sessions:\n`);

  // Group by createdAt rounded to the minute → spot bursts
  const burstMap = new Map<string, number>();
  for (const s of all) {
    const minute = s.createdAt.toISOString().slice(0, 16);
    burstMap.set(minute, (burstMap.get(minute) ?? 0) + 1);
  }

  console.log("Creation timing (grouped to the minute):");
  for (const [minute, count] of burstMap) {
    console.log(`  ${minute} → ${count} sessions ${count > 1 ? "← BURST" : ""}`);
  }

  // Group by seriesId to see how many series we have
  const seriesMap = new Map<string | null, number>();
  for (const s of all) {
    const key = s.seriesId ?? "(no series)";
    seriesMap.set(key, (seriesMap.get(key) ?? 0) + 1);
  }
  console.log("\nGrouping by seriesId:");
  for (const [key, count] of seriesMap) {
    console.log(`  ${typeof key === "string" ? key.slice(0, 8) : key}… → ${count} sessions`);
  }

  // Show every session row in detail
  console.log("\nDetail:");
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    console.log(
      `  ${i + 1}.  created ${s.createdAt.toISOString()}  scheduled ${s.scheduledAt.toISOString()}  type:${s.type}  status:${s.status}  series:${s.seriesId?.slice(0, 8) ?? "—"}…  id:${s.id.slice(0, 8)}…`
    );
  }

  // Also list any session_series rows for this client
  const series = await db
    .select()
    .from(sessionSeries)
    .where(eq(sessionSeries.clientId, vlado.id));
  console.log(`\n${series.length} session_series row(s) for this client:`);
  for (const s of series) {
    console.log(
      `  ${s.id.slice(0, 8)}…  created ${s.createdAt.toISOString()}  frequency:${s.frequency}  count:${s.occurrenceCount}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
