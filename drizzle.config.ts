import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// Next.js convention: .env.local takes precedence over .env. Load both.
config({ path: ".env.local" });
config({ path: ".env" });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
