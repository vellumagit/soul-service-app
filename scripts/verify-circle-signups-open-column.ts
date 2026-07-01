import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE practitioner_settings ADD COLUMN IF NOT EXISTS circle_signups_open BOOLEAN NOT NULL DEFAULT FALSE`;
  const cols = (await sql`
    SELECT column_name, column_default
    FROM information_schema.columns
    WHERE table_name = 'practitioner_settings'
      AND column_name = 'circle_signups_open'
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
