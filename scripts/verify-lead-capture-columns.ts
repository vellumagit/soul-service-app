import "./_load-env";
import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // lead_forms
  await sql`
    CREATE TABLE IF NOT EXISTS lead_forms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      token_prefix TEXT NOT NULL,
      auto_accept BOOLEAN NOT NULL DEFAULT FALSE,
      default_intent TEXT,
      webhook_url TEXT,
      submission_count INTEGER NOT NULL DEFAULT 0,
      last_submission_at TIMESTAMP,
      archived_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS lead_forms_account_idx ON lead_forms(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS lead_forms_token_hash_idx ON lead_forms(token_hash)`;

  // lead_submissions
  await sql`
    CREATE TABLE IF NOT EXISTS lead_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      form_id UUID NOT NULL REFERENCES lead_forms(id) ON DELETE CASCADE,
      name TEXT,
      email TEXT,
      phone TEXT,
      fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      source_ip TEXT,
      user_agent TEXT,
      referer TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      promoted_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP,
      reviewed_action TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS lead_submissions_account_idx ON lead_submissions(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS lead_submissions_form_idx ON lead_submissions(form_id)`;
  await sql`CREATE INDEX IF NOT EXISTS lead_submissions_status_idx ON lead_submissions(account_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS lead_submissions_email_dedup_idx ON lead_submissions(form_id, email)`;

  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('lead_forms','lead_submissions')
    ORDER BY table_name
  `) as Array<{ table_name: string }>;
  console.log("Tables present:");
  for (const t of tables) console.log(`  ${t.table_name}`);

  const indexes = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename IN ('lead_forms','lead_submissions')
      AND indexname IN (
        'lead_forms_account_idx','lead_forms_token_hash_idx',
        'lead_submissions_account_idx','lead_submissions_form_idx',
        'lead_submissions_status_idx','lead_submissions_email_dedup_idx'
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
