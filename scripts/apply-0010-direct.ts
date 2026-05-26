import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  // Use tagged-template syntax (which actually executes) rather than .query().
  console.log("Adding google_last_error...");
  await sql`ALTER TABLE practitioner_settings ADD COLUMN IF NOT EXISTS google_last_error TEXT`;
  console.log("Adding google_last_error_at...");
  await sql`ALTER TABLE practitioner_settings ADD COLUMN IF NOT EXISTS google_last_error_at TIMESTAMP`;
  console.log("Done. Verifying...");
  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='practitioner_settings' AND column_name LIKE 'google%'
    ORDER BY column_name
  `) as Array<{ column_name: string }>;
  for (const c of cols) console.log(`  ${c.column_name}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
