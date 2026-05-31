import "./_load-env";
import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recall_bot_id TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recall_bot_status TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recall_transcript_received_at TIMESTAMP`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_recall_bot_idx ON sessions(recall_bot_id)`;
  await sql`ALTER TABLE practitioner_settings ADD COLUMN IF NOT EXISTS recall_enabled BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE practitioner_settings ADD COLUMN IF NOT EXISTS recall_bot_name TEXT DEFAULT 'Notetaker'`;
  await sql`ALTER TABLE practitioner_settings ADD COLUMN IF NOT EXISTS recall_auto_add BOOLEAN NOT NULL DEFAULT TRUE`;

  const sessCols = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='sessions' AND column_name LIKE 'recall_%'
    ORDER BY column_name
  `) as Array<{ column_name: string; data_type: string }>;
  console.log("Recall columns on sessions:");
  for (const c of sessCols) console.log(`  ${c.column_name} (${c.data_type})`);

  const settCols = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='practitioner_settings' AND column_name LIKE 'recall_%'
    ORDER BY column_name
  `) as Array<{ column_name: string; data_type: string }>;
  console.log("Recall settings on practitioner_settings:");
  for (const c of settCols) console.log(`  ${c.column_name} (${c.data_type})`);

  const idx = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename='sessions' AND indexname='sessions_recall_bot_idx'
  `) as Array<{ indexname: string }>;
  console.log(
    `Index sessions_recall_bot_idx: ${idx.length === 1 ? "present" : "MISSING"}`
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
