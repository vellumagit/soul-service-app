import "./_load-env";
import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_lead BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS met_on DATE`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS met_via_client_id UUID REFERENCES clients(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS clients_lead_idx ON clients(account_id, is_lead)`;
  const cols = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='clients' AND column_name IN ('is_lead', 'met_on', 'met_via_client_id')
    ORDER BY column_name
  `) as Array<{ column_name: string; data_type: string }>;
  console.log("Network columns on clients:");
  for (const c of cols) console.log(`  ${c.column_name} (${c.data_type})`);
  const idx = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename='clients' AND indexname='clients_lead_idx'
  `) as Array<{ indexname: string }>;
  console.log(`Index clients_lead_idx: ${idx.length === 1 ? "present" : "MISSING"}`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
