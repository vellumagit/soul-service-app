// Look at the exact stored shape of Svitlana's Google tokens to see whether
// they're encrypted (v1: prefix) or legacy plaintext, and verify they decrypt
// cleanly with the production TOKEN_ENCRYPTION_KEY.
import { config } from "dotenv";
config({ path: ".env.production" });
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT ps.google_access_token, ps.google_refresh_token,
           ps.google_token_expires_at, a.email
    FROM practitioner_settings ps
    JOIN accounts a ON a.id = ps.account_id
    WHERE a.email = 'solutions.by.svit@gmail.com'
    LIMIT 1
  `) as Array<{
    google_access_token: string | null;
    google_refresh_token: string | null;
    google_token_expires_at: Date | null;
    email: string;
  }>;

  const r = rows[0];
  if (!r) return console.log("Not found");

  const access = r.google_access_token ?? "";
  const refresh = r.google_refresh_token ?? "";

  console.log(`Access token:`);
  console.log(`  length: ${access.length}`);
  console.log(`  starts with: ${access.slice(0, 8)}`);
  console.log(`  encrypted (v1:): ${access.startsWith("v1:")}`);
  console.log(`  parts: ${access.split(":").length}`);

  console.log(`\nRefresh token:`);
  console.log(`  length: ${refresh.length}`);
  console.log(`  starts with: ${refresh.slice(0, 8)}`);
  console.log(`  encrypted (v1:): ${refresh.startsWith("v1:")}`);
  console.log(`  parts: ${refresh.split(":").length}`);

  console.log(`\nExpires at: ${r.google_token_expires_at}`);
  console.log(`Now: ${new Date()}`);
  const isExpired = r.google_token_expires_at
    ? r.google_token_expires_at < new Date()
    : true;
  console.log(`Access token expired: ${isExpired}`);

  // Try to decrypt — using the same logic as token-crypto.ts
  console.log(`\nKey present: ${!!process.env.TOKEN_ENCRYPTION_KEY}`);
  if (process.env.TOKEN_ENCRYPTION_KEY && access.startsWith("v1:")) {
    try {
      const { createDecipheriv } = await import("node:crypto");
      const raw = process.env.TOKEN_ENCRYPTION_KEY.startsWith("base64:")
        ? process.env.TOKEN_ENCRYPTION_KEY.slice(7)
        : process.env.TOKEN_ENCRYPTION_KEY;
      const key = Buffer.from(raw, "base64");
      console.log(`Key length: ${key.length} bytes (should be 32)`);

      const [, ivB64, tagB64, dataB64] = access.split(":");
      const iv = Buffer.from(ivB64, "base64");
      const authTag = Buffer.from(tagB64, "base64");
      const data = Buffer.from(dataB64, "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const dec = Buffer.concat([decipher.update(data), decipher.final()]);
      console.log(`\n✓ Access token decrypts. Plain length: ${dec.length}`);
      console.log(`  starts: ${dec.toString("utf8").slice(0, 12)}`);
    } catch (e) {
      console.log(`\n✗ Access token DECRYPT FAILED:`, e);
    }

    try {
      const { createDecipheriv } = await import("node:crypto");
      const raw = process.env.TOKEN_ENCRYPTION_KEY.startsWith("base64:")
        ? process.env.TOKEN_ENCRYPTION_KEY.slice(7)
        : process.env.TOKEN_ENCRYPTION_KEY;
      const key = Buffer.from(raw, "base64");
      const [, ivB64, tagB64, dataB64] = refresh.split(":");
      const iv = Buffer.from(ivB64, "base64");
      const authTag = Buffer.from(tagB64, "base64");
      const data = Buffer.from(dataB64, "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const dec = Buffer.concat([decipher.update(data), decipher.final()]);
      console.log(`\n✓ Refresh token decrypts. Plain length: ${dec.length}`);
      console.log(`  starts: ${dec.toString("utf8").slice(0, 12)}`);
    } catch (e) {
      console.log(`\n✗ Refresh token DECRYPT FAILED:`, e);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
