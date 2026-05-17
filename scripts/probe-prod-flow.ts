// Probes production directly: forge a session cookie with PROD AUTH_SECRET,
// insert a probe client, then HTTP-GET the production /clients/<id> URL.
// Tells us whether the 404 is a production-only artifact.
import { config } from "dotenv";
config({ path: ".env.production" });
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";

const TARGET_EMAIL = process.argv[2] ?? "solutions.by.svit@gmail.com";
const PROD_URL = process.env.APP_URL?.replace(/\/$/, "") ?? "https://soul-service-app.vercel.app";

async function signCookie(email: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set");
  const enc = new TextEncoder().encode(secret);
  return new SignJWT({ email: email.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(enc);
}

async function main() {
  console.log(`Probing ${PROD_URL} as ${TARGET_EMAIL}\n`);

  const sql = neon(process.env.DATABASE_URL!);
  const acctRows = (await sql`
    SELECT id FROM accounts WHERE email = ${TARGET_EMAIL.toLowerCase()} LIMIT 1
  `) as Array<{ id: string }>;
  if (acctRows.length === 0) {
    console.error(`Account ${TARGET_EMAIL} not found.`);
    process.exit(1);
  }
  const accountId = acctRows[0].id;
  console.log(`Account id: ${accountId}`);

  // Forge cookie with PROD AUTH_SECRET
  const token = await signCookie(TARGET_EMAIL);
  console.log(`Signed cookie with prod AUTH_SECRET (len ${process.env.AUTH_SECRET?.length})`);

  // Sanity: can we even hit the home page?
  const home = await fetch(PROD_URL + "/", {
    headers: { Cookie: `ss_session=${token}` },
    redirect: "manual",
  });
  console.log(`\n[GET /]                            status=${home.status} location=${home.headers.get("location") ?? "(none)"}`);

  // Insert a probe client directly
  const probeName = `[PROD PROBE ${Date.now()}]`;
  const ins = (await sql`
    INSERT INTO clients (account_id, full_name, primary_session_type, tags, sensitivities, status)
    VALUES (${accountId}, ${probeName}, 'Session', ARRAY[]::text[], ARRAY[]::text[], 'active')
    RETURNING id
  `) as Array<{ id: string }>;
  const probeId = ins[0].id;
  console.log(`\nInserted probe client id=${probeId}`);

  // Now hit /clients/<probeId> on production
  const url = `${PROD_URL}/clients/${probeId}`;
  console.log(`\n[GET ${url}]`);
  const res = await fetch(url, {
    headers: { Cookie: `ss_session=${token}` },
    redirect: "manual",
  });
  console.log(`  status: ${res.status}`);
  console.log(`  redirect: ${res.headers.get("location") ?? "(none)"}`);
  console.log(`  content-type: ${res.headers.get("content-type")}`);

  const body = await res.text();
  console.log(`  body length: ${body.length}`);

  // Look for 404 markers
  const looks404 = /This page could not be found|404|Not Found/i.test(body.slice(0, 2000));
  console.log(`  body looks like a 404: ${looks404}`);

  if (res.status === 200 && body.includes(probeName)) {
    console.log("  ✓ probe name found in body — page rendered correctly");
  } else if (res.status === 200) {
    console.log("  ⚠ 200 OK but probe name not in body — snippet follows:");
    console.log(body.slice(0, 600));
  } else {
    console.log("  ✗ non-200 response. Snippet follows:");
    console.log(body.slice(0, 800));
  }

  // Cleanup
  console.log(`\nCleaning up…`);
  await sql`DELETE FROM tasks WHERE client_id = ${probeId}`;
  await sql`DELETE FROM sessions WHERE client_id = ${probeId}`;
  await sql`DELETE FROM clients WHERE id = ${probeId}`;
  console.log("  ✓ probe row deleted");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
