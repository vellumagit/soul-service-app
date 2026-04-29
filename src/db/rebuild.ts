// Drop EVERY table + every enum from the old schema, then re-run the latest
// migration. Useful when the schema has been restructured and we want a clean slate.
//
// Only safe when there's no real data you care about.
//
// Run with: npm run db:rebuild
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

  console.log("Dropping public schema (tables + enums + indexes)…");
  await sql.query(`DROP SCHEMA public CASCADE`);
  await sql.query(`CREATE SCHEMA public`);
  await sql.query(`GRANT ALL ON SCHEMA public TO public`);

  // Apply latest migration files in order
  const dir = join(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    console.log(`Applying ${file}…`);
    const content = readFileSync(join(dir, file), "utf8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        await sql.query(stmt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed:\n${stmt}\n\n${msg}`);
        throw err;
      }
    }
  }
  console.log("Rebuild complete.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
