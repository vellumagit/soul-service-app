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
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

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
