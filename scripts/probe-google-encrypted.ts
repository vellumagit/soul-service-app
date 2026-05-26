// Pull Svitlana's encrypted tokens from the DB, decrypt them with the prod
// TOKEN_ENCRYPTION_KEY (loaded from .env.production), and call Google
// directly to see exactly what the failure is. The TestGoogleButton on
// /status does the same thing in-app — this is a fallback for when she
// hasn't clicked it yet and we need to know.
//
// Usage:
//   vercel env pull .env.production --environment=production --yes
//   npx tsx scripts/probe-google-encrypted.ts <account_email>
//   rm .env.production
import { config } from "dotenv";
config({ path: ".env.production" });
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { createDecipheriv } from "node:crypto";
import { google } from "googleapis";

const targetEmail = process.argv[2] ?? "solutions.by.svit@gmail.com";

function decrypt(stored: string): string {
  if (!stored.startsWith("v1:")) return stored;
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  const b64 = rawKey.startsWith("base64:") ? rawKey.slice(7) : rawKey;
  if (!b64) throw new Error("TOKEN_ENCRYPTION_KEY missing");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error(`Key is ${key.length} bytes, need 32`);
  const [, ivB64, tagB64, dataB64] = stored.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const rows = (await sql`
    SELECT ps.google_access_token, ps.google_refresh_token,
           ps.google_token_expires_at, ps.google_calendar_email,
           ps.google_connected_at
    FROM practitioner_settings ps
    JOIN accounts a ON a.id = ps.account_id
    WHERE a.email = ${targetEmail.toLowerCase()}
    LIMIT 1
  `) as Array<{
    google_access_token: string | null;
    google_refresh_token: string | null;
    google_token_expires_at: Date | null;
    google_calendar_email: string | null;
    google_connected_at: Date | null;
  }>;

  const r = rows[0];
  if (!r || !r.google_refresh_token) {
    console.log("No connection found.");
    return;
  }

  console.log(`Account: ${targetEmail}`);
  console.log(`Connected to: ${r.google_calendar_email}`);
  console.log(`Connected at: ${r.google_connected_at}`);
  console.log(`Token expires: ${r.google_token_expires_at}`);

  const daysSinceConnect = r.google_connected_at
    ? Math.floor(
        (Date.now() - r.google_connected_at.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;
  console.log(`Days since connect: ${daysSinceConnect}`);

  let refresh: string;
  try {
    refresh = decrypt(r.google_refresh_token);
    console.log(`\n✓ Refresh token decrypted, length=${refresh.length}`);
  } catch (e) {
    console.log(`\n✗ Decrypt failed:`, e);
    return;
  }

  // Build the OAuth client the same way the app does.
  const redirectUri = `${process.env.APP_URL?.replace(/\/$/, "")}/api/auth/google/callback`;
  console.log(`\nClient ID set: ${!!process.env.GOOGLE_CLIENT_ID}`);
  console.log(`Client secret set: ${!!process.env.GOOGLE_CLIENT_SECRET}`);
  console.log(`Redirect URI: ${redirectUri}`);

  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  oauth.setCredentials({ refresh_token: refresh });

  console.log("\nStep 1: Refreshing access token…");
  try {
    const refreshed = await oauth.refreshAccessToken();
    console.log("  ✓ Refresh succeeded.");
    console.log(`  expires at: ${new Date(refreshed.credentials.expiry_date!).toISOString()}`);
  } catch (err) {
    console.log("  ✗ REFRESH FAILED");
    explain(err);
    return;
  }

  console.log("\nStep 2: Creating a probe Calendar event…");
  const calendar = google.calendar({ version: "v3", auth: oauth });
  const startAt = new Date(Date.now() + 60 * 60 * 1000); // 1h from now
  const endAt = new Date(startAt.getTime() + 5 * 60 * 1000);
  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "none",
      conferenceDataVersion: 1,
      requestBody: {
        summary: "[Soul Service probe — safe to delete]",
        description: "Diagnostic from probe-google-encrypted.ts",
        start: { dateTime: startAt.toISOString() },
        end: { dateTime: endAt.toISOString() },
        conferenceData: {
          createRequest: {
            requestId: `probe-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });
    console.log("  ✓ Event created.");
    console.log(`  eventId: ${res.data.id}`);
    console.log(
      `  meetUrl: ${
        res.data.conferenceData?.entryPoints?.find(
          (e) => e.entryPointType === "video"
        )?.uri ?? "(none returned)"
      }`
    );
    console.log("\nStep 3: Cleaning up the probe event…");
    await calendar.events.delete({
      calendarId: "primary",
      eventId: res.data.id!,
      sendUpdates: "none",
    });
    console.log("  ✓ Deleted.");
    console.log("\n🎉 Google Calendar fully works for this account.");
  } catch (err) {
    console.log("  ✗ CALENDAR INSERT FAILED");
    explain(err);
  }
}

function explain(err: unknown) {
  if (!err || typeof err !== "object") {
    console.log(`    ${err}`);
    return;
  }
  const e = err as Record<string, unknown>;
  if (e.message) console.log(`    message: ${e.message}`);
  if (e.code !== undefined) console.log(`    code: ${e.code}`);
  if (e.status !== undefined) console.log(`    status: ${e.status}`);
  const res = e.response as Record<string, unknown> | undefined;
  if (res) {
    if (res.status) console.log(`    response.status: ${res.status}`);
    if (res.data) console.log(`    response.data: ${JSON.stringify(res.data, null, 2)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
