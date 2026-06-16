import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // clients — portal_enabled + last_portal_visit_at
  await sql`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS last_portal_visit_at TIMESTAMP
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS clients_portal_enabled_idx
      ON clients(account_id, portal_enabled) WHERE portal_enabled = TRUE
  `;

  // client_portal_tokens
  await sql`
    CREATE TABLE IF NOT EXISTS client_portal_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      requested_ip TEXT,
      requested_user_agent TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS client_portal_tokens_hash_idx ON client_portal_tokens(token_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS client_portal_tokens_client_idx ON client_portal_tokens(client_id)`;

  // client_portal_sessions
  await sql`
    CREATE TABLE IF NOT EXISTS client_portal_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      cookie_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_ip TEXT,
      created_user_agent TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS client_portal_sessions_cookie_idx ON client_portal_sessions(cookie_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS client_portal_sessions_client_idx ON client_portal_sessions(client_id)`;

  // reschedule_requests
  await sql`
    CREATE TABLE IF NOT EXISTS reschedule_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      reason TEXT,
      preferred_times JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMP,
      reviewed_note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS reschedule_requests_account_status_idx ON reschedule_requests(account_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS reschedule_requests_client_idx ON reschedule_requests(client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS reschedule_requests_session_idx ON reschedule_requests(session_id)`;

  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'clients'
      AND column_name IN ('portal_enabled','last_portal_visit_at')
    ORDER BY column_name
  `) as Array<{ column_name: string }>;
  console.log("clients columns added:");
  for (const c of cols) console.log(`  ${c.column_name}`);

  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('client_portal_tokens','client_portal_sessions','reschedule_requests')
    ORDER BY table_name
  `) as Array<{ table_name: string }>;
  console.log("Tables present:");
  for (const t of tables) console.log(`  ${t.table_name}`);

  const indexes = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename IN ('clients','client_portal_tokens','client_portal_sessions','reschedule_requests')
      AND indexname IN (
        'clients_portal_enabled_idx',
        'client_portal_tokens_hash_idx','client_portal_tokens_client_idx',
        'client_portal_sessions_cookie_idx','client_portal_sessions_client_idx',
        'reschedule_requests_account_status_idx','reschedule_requests_client_idx','reschedule_requests_session_idx'
      )
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
