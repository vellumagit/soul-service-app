import "./_load-env";
import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  // Apply migration (idempotent)
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS closing_landed TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS closing_remember TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS closing_never_forget TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS closing_completed_at TIMESTAMP`;
  const cols = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='sessions' AND column_name LIKE 'closing%'
    ORDER BY column_name
  `) as Array<{ column_name: string; data_type: string }>;
  console.log("Closing columns on sessions:");
  for (const c of cols) console.log(`  ${c.column_name}  (${c.data_type})`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
