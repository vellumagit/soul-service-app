// One-off: apply drizzle/0010_google_last_error.sql to the connected DB.
// Idempotent thanks to ADD COLUMN IF NOT EXISTS.
import "./_load-env";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const file = readFileSync(
    join(process.cwd(), "drizzle", "0010_google_last_error.sql"),
    "utf8"
  );
  // Pull out just the ALTER TABLE — the file has comments above. Neon's HTTP
  // driver wants one statement per query, so we split conservatively.
  const statements = file
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
  for (const stmt of statements) {
    // Strip leading comments before the actual SQL
    const cleaned = stmt
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim();
    if (!cleaned) continue;
    console.log(`Running: ${cleaned.slice(0, 80)}…`);
    await sql.query(cleaned);
  }
  console.log("✓ Migration applied.");

  // Verify the columns exist
  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'practitioner_settings'
    AND column_name IN ('google_last_error', 'google_last_error_at')
  `) as Array<{ column_name: string }>;
  console.log(`Verified columns: ${cols.map((c) => c.column_name).join(", ")}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
