import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      default_capacity INTEGER NOT NULL DEFAULT 20,
      default_duration_minutes INTEGER NOT NULL DEFAULT 120,
      default_price_cents INTEGER NOT NULL DEFAULT 2000,
      default_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
      payment_instructions TEXT,
      published BOOLEAN NOT NULL DEFAULT TRUE,
      archived_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS groups_account_idx ON groups(account_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS group_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 120,
      capacity INTEGER NOT NULL DEFAULT 20,
      price_cents INTEGER NOT NULL DEFAULT 2000,
      topic TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      meet_url TEXT,
      google_event_id TEXT,
      notes TEXT,
      recall_bot_id TEXT,
      recall_bot_status TEXT,
      recall_transcript_received_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS group_sessions_group_idx ON group_sessions(group_id)`;
  await sql`CREATE INDEX IF NOT EXISTS group_sessions_account_scheduled_idx ON group_sessions(account_id, scheduled_at)`;
  await sql`CREATE INDEX IF NOT EXISTS group_sessions_public_listing_idx ON group_sessions(account_id, status, scheduled_at) WHERE status = 'scheduled'`;

  await sql`
    CREATE TABLE IF NOT EXISTS group_attendees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      group_session_id UUID NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      paid BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at TIMESTAMP,
      payment_method TEXT,
      attended BOOLEAN,
      practitioner_notes TEXT,
      source_ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS group_attendees_session_idx ON group_attendees(group_session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS group_attendees_account_status_idx ON group_attendees(account_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS group_attendees_email_per_session_idx ON group_attendees(group_session_id, email)`;

  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('groups','group_sessions','group_attendees')
    ORDER BY table_name
  `) as Array<{ table_name: string }>;
  console.log("Tables present:");
  for (const t of tables) console.log(`  ${t.table_name}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
