import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    ALTER TABLE practitioner_settings
      ADD COLUMN IF NOT EXISTS auto_portal_invite_on_accept BOOLEAN NOT NULL DEFAULT TRUE
  `;
  const cols = (await sql`
    SELECT column_name, column_default
    FROM information_schema.columns
    WHERE table_name = 'practitioner_settings'
      AND column_name = 'auto_portal_invite_on_accept'
  `) as Array<{ column_name: string; column_default: string }>;
  console.log("Column present:");
  for (const c of cols) console.log(`  ${c.column_name} (default ${c.column_default})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
