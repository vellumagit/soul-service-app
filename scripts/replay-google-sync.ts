// Replays the Google Calendar sync against a real session, prints the real
// error if it fails. Read-mostly: it WILL create a Google Calendar event if
// it succeeds, but won't write back to the DB (we're just diagnosing).
//
// Usage: pass --apply to also write the resulting googleEventId/meetUrl back
// to the sessions table.
//
//   npx tsx scripts/replay-google-sync.ts <email>            (dry — just probe)
//   npx tsx scripts/replay-google-sync.ts <email> --apply   (persist event back)
import "./_load-env";
import { db } from "@/db";
import { accounts, sessions, clients, practitionerSettings } from "@/db/schema";
import { sql, eq, and, isNull } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const targetEmail = process.argv[2];

if (!targetEmail || targetEmail.startsWith("--")) {
  console.error("Usage: npx tsx scripts/replay-google-sync.ts <account_email> [--apply]");
  process.exit(1);
}

async function main() {
  const [acct] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, targetEmail));
  if (!acct) {
    console.error(`Account ${targetEmail} not found.`);
    process.exit(1);
  }

  console.log(`\nAccount: ${acct.email} (${acct.id.slice(0, 8)}…)\n`);

  // Pick the next unsynced future session as a guinea pig
  const [target] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.accountId, acct.id),
        isNull(sessions.googleEventId),
        sql`${sessions.scheduledAt} > now()`
      )
    )
    .orderBy(sessions.scheduledAt)
    .limit(1);

  if (!target) {
    console.log("No unsynced future sessions to test with. Try syncing a past one:");
    const [pastTarget] = await db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.accountId, acct.id), isNull(sessions.googleEventId))
      )
      .orderBy(sql`${sessions.createdAt} desc`)
      .limit(1);
    if (!pastTarget) {
      console.log("  …no unsynced sessions at all. All synced? (Or none exist.)");
      return;
    }
    console.log("  Using most recent unsynced session instead.");
    await tryOne(pastTarget, acct.id);
    return;
  }

  await tryOne(target, acct.id);
}

async function tryOne(
  target: typeof sessions.$inferSelect,
  accountId: string
) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, target.clientId));
  console.log(
    `Probing session ${target.id.slice(0, 8)}…  ${target.type} · ${client?.fullName}  @ ${target.scheduledAt.toISOString()}\n`
  );

  // Pull settings so we know what credentials are in play
  const [settings] = await db
    .select()
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, accountId));

  console.log("Pre-flight:");
  console.log(`  GOOGLE_CLIENT_ID set:      ${!!process.env.GOOGLE_CLIENT_ID}`);
  console.log(`  GOOGLE_CLIENT_SECRET set:  ${!!process.env.GOOGLE_CLIENT_SECRET}`);
  console.log(`  APP_URL:                   ${process.env.APP_URL ?? "(unset)"}`);
  console.log(`  Refresh token:             ${settings?.googleRefreshToken ? "present" : "MISSING"}`);
  console.log(`  Access token expires at:   ${settings?.googleTokenExpiresAt?.toISOString() ?? "—"}`);
  console.log();

  try {
    const { createCalendarEvent } = await import("@/lib/google-calendar");
    const result = await createCalendarEvent(accountId, {
      summary: `${target.type} · ${client?.fullName ?? "client"}`,
      description: "Test sync from replay script",
      startAt: target.scheduledAt,
      durationMinutes: target.durationMinutes,
      attendeeEmail: client?.email ?? null,
      practitionerEmail: settings?.googleCalendarEmail ?? null,
    });

    if (!result) {
      console.log("Result: null (means Google not connected for this account — but we know it is)");
      return;
    }

    console.log("✓ SUCCESS!");
    console.log(`  eventId: ${result.eventId}`);
    console.log(`  meetUrl: ${result.meetUrl}`);
    console.log(`  htmlLink: ${result.htmlLink}`);

    if (APPLY) {
      await db
        .update(sessions)
        .set({
          googleEventId: result.eventId,
          meetUrl: result.meetUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, target.id));
      console.log(`\n  → wrote back to sessions row ${target.id.slice(0, 8)}…`);
    } else {
      console.log("\n  (Not writing back to DB. Pass --apply to persist.)");
      console.log("  ALSO: a Google Calendar event was created. Delete it manually if not wanted.");
    }
  } catch (err) {
    console.log("✗ FAILED");
    console.log("  Error:", err instanceof Error ? err.message : String(err));
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      if (e.code) console.log("  code:", e.code);
      if (e.status) console.log("  status:", e.status);
      if (e.errors) console.log("  errors:", JSON.stringify(e.errors, null, 2));
      if (e.response) {
        const r = e.response as Record<string, unknown>;
        if (r.status) console.log("  response.status:", r.status);
        if (r.data) console.log("  response.data:", JSON.stringify(r.data, null, 2));
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script error:", err);
    process.exit(1);
  });
