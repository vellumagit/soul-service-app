import "./_load-env";
import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE practitioner_settings ADD COLUMN IF NOT EXISTS sabbath_days TEXT[] NOT NULL DEFAULT '{}'`;
  const cols = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='practitioner_settings' AND column_name='sabbath_days'
  `) as Array<{ column_name: string; data_type: string }>;
  console.log("sabbath_days column:");
  for (const c of cols) console.log(`  ${c.column_name} (${c.data_type})`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
