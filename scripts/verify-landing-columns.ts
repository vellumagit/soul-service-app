import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    ALTER TABLE practitioner_settings
      ADD COLUMN IF NOT EXISTS landing_tagline TEXT,
      ADD COLUMN IF NOT EXISTS landing_about TEXT,
      ADD COLUMN IF NOT EXISTS landing_how_it_works TEXT,
      ADD COLUMN IF NOT EXISTS landing_what_to_expect TEXT
  `;

  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'practitioner_settings'
      AND column_name IN (
        'landing_tagline',
        'landing_about',
        'landing_how_it_works',
        'landing_what_to_expect'
      )
    ORDER BY column_name
  `) as Array<{ column_name: string }>;
  console.log("practitioner_settings columns added:");
  for (const c of cols) console.log(`  ${c.column_name}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
