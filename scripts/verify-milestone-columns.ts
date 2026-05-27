import "./_load-env";
import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS milestone_label TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS milestone_at TIMESTAMP`;
  const cols = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='sessions' AND column_name LIKE 'milestone%'
    ORDER BY column_name
  `) as Array<{ column_name: string; data_type: string }>;
  console.log("Milestone columns on sessions:");
  for (const c of cols) console.log(`  ${c.column_name} (${c.data_type})`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
