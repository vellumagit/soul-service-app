// Self-contained Google Calendar probe — pulls Svitlana's refresh token from
// the DB, asks Google for a fresh access token, then tries to create a tiny
// test event. Prints the exact Google error so we know what to fix.
//
// Uses production env (pulled via `vercel env pull .env.production`) so we
// hit the same client credentials as the app.
//
// Usage:
//   vercel env pull .env.production --environment=production --yes
//   npx tsx scripts/probe-google-directly.ts <account_email>
//
// SAFETY: This may create a Google Calendar event under her primary calendar
// (we'll log the event ID + a "delete me" hint).
import { config } from "dotenv";
// Production env first (has GOOGLE_CLIENT_ID/SECRET), then local (has DATABASE_URL).
config({ path: ".env.production" });
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { google } from "googleapis";

const targetEmail = process.argv[2];
if (!targetEmail) {
  console.error("Usage: npx tsx scripts/probe-google-directly.ts <email>");
  process.exit(1);
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // 1. Find account + settings
  const rows = (await sql`
    SELECT a.id as account_id, a.email as account_email,
           ps.google_refresh_token, ps.google_access_token,
           ps.google_calendar_email, ps.google_token_expires_at,
           ps.google_connected_at
    FROM accounts a
    LEFT JOIN practitioner_settings ps ON ps.account_id = a.id
    WHERE a.email = ${targetEmail}
    LIMIT 1
  `) as Array<{
    account_id: string;
    account_email: string;
    google_refresh_token: string | null;
    google_access_token: string | null;
    google_calendar_email: string | null;
    google_token_expires_at: Date | null;
    google_connected_at: Date | null;
  }>;

  if (rows.length === 0) {
    console.error(`Account ${targetEmail} not found.`);
    process.exit(1);
  }

  const settings = rows[0];

  console.log(`\nAccount: ${settings.account_email}`);
  console.log(`Google calendar email: ${settings.google_calendar_email}`);
  console.log(`Connected at: ${settings.google_connected_at}`);
  console.log(`Token expires: ${settings.google_token_expires_at}`);
  console.log(`Refresh token present: ${!!settings.google_refresh_token}\n`);

  if (!settings.google_refresh_token) {
    console.error("No refresh token. She needs to reconnect.");
    process.exit(1);
  }

  // 2. Build OAuth client (same way the app does)
  const redirectUri = `${process.env.APP_URL?.replace(/\/$/, "")}/api/auth/google/callback`;
  console.log(`Using redirectUri: ${redirectUri}`);
  console.log(`Using clientId: ${process.env.GOOGLE_CLIENT_ID?.slice(0, 20)}…`);

  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  oauth.setCredentials({
    access_token: settings.google_access_token,
    refresh_token: settings.google_refresh_token,
    expiry_date: settings.google_token_expires_at?.getTime() ?? null,
  });

  // 3. Try to refresh the access token explicitly — this surfaces "invalid_grant"
  //    (the most common cause of Google sync failure: refresh token revoked).
  console.log("\nStep 1: Refreshing access token…");
  try {
    const { credentials } = await oauth.refreshAccessToken();
    console.log("  ✓ Refresh succeeded.");
    console.log(`  New access_token: ${credentials.access_token?.slice(0, 20)}…`);
    console.log(`  Expires at: ${new Date(credentials.expiry_date ?? 0).toISOString()}`);
  } catch (err) {
    console.log("  ✗ Refresh FAILED.");
    explainError(err);
    process.exit(1);
  }

  // 4. Now try to create a test event with a Meet link
  console.log("\nStep 2: Creating test Calendar event with Meet link…");
  const calendar = google.calendar({ version: "v3", auth: oauth });
  const startAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // tomorrow
  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
  const requestId = `probe-${Date.now()}`;

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "none",
      conferenceDataVersion: 1,
      requestBody: {
        summary: "[Probe — please ignore/delete]",
        description: "Diagnostic event created by replay script. Safe to delete.",
        start: { dateTime: startAt.toISOString() },
        end: { dateTime: endAt.toISOString() },
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    console.log("  ✓ Event created!");
    console.log(`  eventId: ${res.data.id}`);
    console.log(`  htmlLink: ${res.data.htmlLink}`);
    const meetUrl =
      res.data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri ?? res.data.hangoutLink ?? null;
    console.log(`  meetUrl: ${meetUrl ?? "(no Meet link returned!)"}`);

    if (!meetUrl) {
      console.log(
        "\n  ⚠ Calendar created the event but did NOT attach a Meet link."
      );
      console.log(
        "  This usually means the Google account doesn't have permission to"
      );
      console.log(
        "  auto-generate Meet links. Common causes:"
      );
      console.log(
        "    - Workspace policy disables external conference creation"
      );
      console.log(
        "    - Personal account where Meet isn't enabled in Calendar"
      );
    }

    console.log(`\n  → Delete this test event: https://calendar.google.com/calendar/event?eid=${res.data.id}`);
  } catch (err) {
    console.log("  ✗ Event creation FAILED.");
    explainError(err);
  }
}

function explainError(err: unknown) {
  if (!err || typeof err !== "object") {
    console.log("  ", err);
    return;
  }
  const e = err as Record<string, unknown>;
  console.log(`  message: ${(e.message as string) ?? "(none)"}`);
  if (e.code !== undefined) console.log(`  code: ${e.code}`);
  if (e.status !== undefined) console.log(`  status: ${e.status}`);
  if (e.errors) console.log(`  errors: ${JSON.stringify(e.errors, null, 2)}`);
  if (e.response) {
    const r = e.response as Record<string, unknown>;
    if (r.status) console.log(`  response.status: ${r.status}`);
    if (r.data) console.log(`  response.data: ${JSON.stringify(r.data, null, 2)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script error:");
    console.error(err);
    process.exit(1);
  });
