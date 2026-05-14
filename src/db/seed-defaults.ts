// Standalone seed CLI — used for re-seeding starter templates into an
// existing account. NOT used during normal sign-in (that path lives in
// src/lib/account.ts → getOrCreateAccount, which seeds inline on first
// sign-in).
//
// Run with:  npm run db:seed-defaults <email>
// (where <email> is the account's email — the script finds the account by
// email and tops up any missing starter templates without touching customizations.)
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "./index";
import { accounts } from "./schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error(
      "Usage: npm run db:seed-defaults <email>\n" +
        "       (Pass the email of the account you want to (re)seed.)"
    );
    process.exit(1);
  }

  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, email.toLowerCase()))
    .limit(1);

  if (!rows[0]) {
    console.error(
      `No account found for ${email}. Sign in at /signin first to create it.`
    );
    process.exit(1);
  }

  console.log(
    `Account ${email} already exists. Starter templates are seeded at sign-in time, not here.`
  );
  console.log(
    `If you want a fresh set of starters, delete the existing ones in Settings → Templates and they will not auto-recreate.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
