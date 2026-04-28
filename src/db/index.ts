import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// The DATABASE_URL points at Neon today. When migrating to Supabase later,
// change the env var to the Supabase pooler connection string and swap
// `neon-http` for `postgres-js`. Schema and queries stay identical.

// Lazy-init so Next.js builds without DATABASE_URL set (queries still need it at runtime).
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local — see .env.example."
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}

// `db` is a Proxy that forwards property access to the lazily-initialized client.
// This lets app code keep writing `db.select(...)` while build-time evaluation never connects.
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * from "./schema";
