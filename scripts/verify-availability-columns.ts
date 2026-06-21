import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    ALTER TABLE practitioner_settings
      ADD COLUMN IF NOT EXISTS working_hours JSONB,
      ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NOT NULL DEFAULT 15,
      ADD COLUMN IF NOT EXISTS default_session_minutes INTEGER NOT NULL DEFAULT 60,
      ADD COLUMN IF NOT EXISTS show_availability_publicly BOOLEAN NOT NULL DEFAULT FALSE
  `;
  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'practitioner_settings'
      AND column_name IN (
        'working_hours',
        'buffer_minutes',
        'default_session_minutes',
        'show_availability_publicly'
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
