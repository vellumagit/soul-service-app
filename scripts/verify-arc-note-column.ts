// Applies migration 0066 (idempotent) and confirms the column exists.
import "./_load-env";
import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "arc_note" text`;
  const cols = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='sessions' AND column_name='arc_note'`) as Array<{ column_name: string; data_type: string }>;
  console.log("arc_note:", cols.map((c) => `${c.column_name} (${c.data_type})`).join(", ") || "MISSING");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
