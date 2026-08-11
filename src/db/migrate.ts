// Apply generated SQL migrations to the database.
// Used in place of `drizzle-kit push` when running non-interactively.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  const dir = join(process.cwd(), "drizzle");
  // Optional filename argument: apply ONLY that migration file. Without it,
  // replay every file in order (the original behaviour). Applying a single new
  // migration to an already-built DB avoids replaying history — and the replay
  // chokes on older hand-written files that pack multiple statements into one
  // chunk, which Neon's HTTP driver rejects ("cannot insert multiple commands
  // into a prepared statement"). Accepts "0052_x.sql" or "drizzle/0052_x.sql".
  const only = process.argv[2]?.replace(/^drizzle[\\/]/, "");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !only || f === only)
    .sort();
  if (only && files.length === 0) {
    throw new Error(`No migration file named "${only}" in ${dir}`);
  }

  for (const file of files) {
    console.log(`Applying ${file}…`);
    const content = readFileSync(join(dir, file), "utf8");
    // drizzle-kit splits statements with --> statement-breakpoint
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        await sql.query(stmt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Tolerate "already exists" so this is idempotent
        if (
          msg.includes("already exists") ||
          msg.includes("duplicate")
        ) {
          continue;
        }
        console.error(`  Failed on:\n${stmt}\n`);
        throw err;
      }
    }
  }
  console.log("Done.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
