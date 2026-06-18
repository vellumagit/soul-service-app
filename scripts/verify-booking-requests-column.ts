import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS client_booking_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      preferred_times TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMP,
      reviewed_note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS client_booking_requests_account_status_idx ON client_booking_requests(account_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS client_booking_requests_client_idx ON client_booking_requests(client_id)`;

  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'client_booking_requests'
  `) as Array<{ table_name: string }>;
  console.log("Tables present:");
  for (const t of tables) console.log(`  ${t.table_name}`);

  const indexes = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'client_booking_requests'
    ORDER BY indexname
  `) as Array<{ indexname: string }>;
  console.log("Indexes present:");
  for (const i of indexes) console.log(`  ${i.indexname}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
