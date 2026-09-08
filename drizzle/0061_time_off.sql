-- Time off: a range she's away. Applying it cancels every session inside the
-- range (one email per client, not one per session) and blocks new bookings
-- inside it (availability.ts).
CREATE TABLE IF NOT EXISTS "time_off" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "note" text,
  "sessions_cancelled" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_off_account_idx" ON "time_off" ("account_id", "starts_at");
