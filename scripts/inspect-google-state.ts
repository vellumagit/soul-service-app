// Read-only — checks Google Calendar connection state for every account,
// and inspects sessions to see whether they have googleEventId / meetUrl set.
// Helps diagnose "I connected Google but the meet link never shows up."
import "./_load-env";
import { db } from "@/db";
import { accounts, practitionerSettings, sessions, clients } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

async function main() {
  const accts = await db.select().from(accounts);

  for (const a of accts) {
    console.log(`\n══ ${a.email} (${a.id.slice(0, 8)}…) ══`);

    const [s] = await db
      .select({
        googleRefreshToken: practitionerSettings.googleRefreshToken,
        googleAccessToken: practitionerSettings.googleAccessToken,
        googleCalendarEmail: practitionerSettings.googleCalendarEmail,
        googleConnectedAt: practitionerSettings.googleConnectedAt,
        googleTokenExpiresAt: practitionerSettings.googleTokenExpiresAt,
      })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, a.id));

    if (!s) {
      console.log("  (no settings row yet)");
      continue;
    }

    console.log(
      `  Google connected:    ${s.googleRefreshToken ? "YES" : "no"}`
    );
    console.log(`  Google email:        ${s.googleCalendarEmail ?? "—"}`);
    console.log(`  Connected at:        ${s.googleConnectedAt?.toISOString() ?? "—"}`);
    console.log(
      `  Token expires at:    ${s.googleTokenExpiresAt?.toISOString() ?? "—"}`
    );
    console.log(
      `  Has access_token:    ${s.googleAccessToken ? "yes (len " + s.googleAccessToken.length + ")" : "no"}`
    );

    // Now look at her recent sessions — do any have googleEventId?
    const recentSessions = await db
      .select({
        id: sessions.id,
        scheduledAt: sessions.scheduledAt,
        type: sessions.type,
        clientId: sessions.clientId,
        googleEventId: sessions.googleEventId,
        meetUrl: sessions.meetUrl,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(eq(sessions.accountId, a.id))
      .orderBy(sql`${sessions.createdAt} desc`)
      .limit(10);

    if (recentSessions.length === 0) {
      console.log("  (no sessions)");
      continue;
    }

    console.log(`\n  Last ${recentSessions.length} sessions:`);
    for (const sess of recentSessions) {
      const [c] = await db
        .select({ fullName: clients.fullName })
        .from(clients)
        .where(eq(clients.id, sess.clientId));
      const synced = sess.googleEventId ? "✓ synced" : "✗ NOT synced";
      const meet = sess.meetUrl ? "✓ meet" : "✗ no meet";
      console.log(
        `    ${sess.createdAt.toISOString()}  ${(c?.fullName ?? "?").padEnd(20)}  ${sess.type.padEnd(30)}  ${synced.padEnd(12)}  ${meet}`
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
