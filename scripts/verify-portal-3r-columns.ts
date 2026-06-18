import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS client_stated_intention TEXT,
      ADD COLUMN IF NOT EXISTS client_visible_note TEXT
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS client_reflections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS client_reflections_account_idx ON client_reflections(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS client_reflections_client_idx ON client_reflections(client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS client_reflections_session_idx ON client_reflections(session_id)`;

  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sessions'
      AND column_name IN ('client_stated_intention', 'client_visible_note')
    ORDER BY column_name
  `) as Array<{ column_name: string }>;
  console.log("sessions columns added:");
  for (const c of cols) console.log(`  ${c.column_name}`);

  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'client_reflections'
  `) as Array<{ table_name: string }>;
  console.log("Tables present:");
  for (const t of tables) console.log(`  ${t.table_name}`);

  const indexes = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'client_reflections'
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
