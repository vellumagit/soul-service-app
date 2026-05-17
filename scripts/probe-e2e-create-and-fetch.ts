// End-to-end probe — forges a session cookie, inserts a client, then HTTP-GETs
// /clients/<id> against the running dev server to see what response code comes
// back. Helps confirm whether the 404 reproduces locally.
//
// Usage:
//   npm run dev   (in another shell)
//   npx tsx scripts/probe-e2e-create-and-fetch.ts
import "./_load-env";
import { db } from "@/db";
import { clients, accounts, sessions, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";

const EMAIL = "default@local";
const BASE = "http://localhost:3000";

async function signCookie(email: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set in .env.local");
  const enc = new TextEncoder().encode(secret);
  return new SignJWT({ email: email.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(enc);
}

async function main() {
  // 1. Forge a cookie
  const token = await signCookie(EMAIL);
  console.log(`Forged session cookie for ${EMAIL}`);

  // 2. Ensure the account exists
  let [acct] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, EMAIL));
  if (!acct) {
    console.log("  account doesn't exist, will be created on first request");
  } else {
    console.log(`  account exists: ${acct.id}`);
  }

  // 3. Probe /signin GET (sanity check)
  const ping = await fetch(`${BASE}/signin`, {
    headers: { Cookie: `ss_session=${token}` },
  });
  console.log(`\n[GET /signin (signed-in)]  status=${ping.status}, redirected=${ping.redirected}`);
  // If we're signed-in, /signin redirects to / (307 in browser, fetch follows)

  // 4. Insert a probe client directly (simulating createClient's first half)
  const acctId = acct?.id;
  if (!acctId) {
    console.log("\nNo account row yet. Visit /signin in the browser first to create it.");
    return;
  }
  const probeName = `[E2E PROBE ${Date.now()}]`;
  const [newClient] = await db
    .insert(clients)
    .values({
      accountId: acctId,
      fullName: probeName,
      primarySessionType: "Session",
      tags: [],
      sensitivities: [],
      status: "active",
    })
    .returning({ id: clients.id });
  console.log(`\nInserted probe client ${newClient.id}`);

  // 5. Now HTTP-GET the page like a browser would
  const url = `${BASE}/clients/${newClient.id}`;
  console.log(`\n[GET ${url}]`);
  const res = await fetch(url, {
    headers: { Cookie: `ss_session=${token}` },
    redirect: "manual",
  });
  console.log(`  status: ${res.status}`);
  console.log(`  redirect target: ${res.headers.get("location") ?? "(none)"}`);
  const body = await res.text();
  console.log(`  body length: ${body.length}`);
  if (res.status >= 400 || body.includes("not found") || body.includes("404")) {
    const snippet = body.slice(0, 800);
    console.log(`  body snippet:\n  ${snippet.split("\n").join("\n  ")}`);
  } else {
    // Look for the probe name in the response to confirm the page rendered
    const seen = body.includes(probeName);
    console.log(`  page rendered with probe name visible: ${seen}`);
  }

  // 6. Cleanup
  console.log(`\nCleaning up…`);
  await db.delete(tasks).where(eq(tasks.clientId, newClient.id));
  await db.delete(sessions).where(eq(sessions.clientId, newClient.id));
  await db.delete(clients).where(eq(clients.id, newClient.id));
  console.log("  ✓ probe row deleted");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
