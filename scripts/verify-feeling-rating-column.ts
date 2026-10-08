// Applies migration 0065 (idempotent) and confirms the column + range check.
import "./_load-env";
import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "feeling_rating" integer`;
  await sql`DO $$ BEGIN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_feeling_rating_range"
      CHECK ("feeling_rating" IS NULL OR "feeling_rating" BETWEEN 1 AND 10);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`;
  const cols = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='sessions' AND column_name='feeling_rating'`) as Array<{ column_name: string; data_type: string }>;
  const checks = (await sql`
    SELECT conname FROM pg_constraint WHERE conname='sessions_feeling_rating_range'`) as Array<{ conname: string }>;
  console.log("feeling_rating:", cols.map((c) => `${c.column_name} (${c.data_type})`).join(", ") || "MISSING");
  console.log("range check:", checks.length ? checks[0].conname : "MISSING");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
