import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS user_magic_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      requested_ip TEXT,
      requested_user_agent TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS user_magic_links_hash_idx ON user_magic_links(token_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS user_magic_links_email_idx ON user_magic_links(email)`;

  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'user_magic_links'
  `) as Array<{ table_name: string }>;
  console.log("Tables present:");
  for (const t of tables) console.log(`  ${t.table_name}`);

  const indexes = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'user_magic_links'
      AND indexname IN ('user_magic_links_hash_idx','user_magic_links_email_idx')
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
