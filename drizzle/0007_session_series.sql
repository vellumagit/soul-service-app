-- New enum for recurring frequency
DO $$ BEGIN
  CREATE TYPE "series_frequency" AS ENUM ('weekly', 'biweekly', 'monthly');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- The series table
CREATE TABLE IF NOT EXISTS "session_series" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "type" text NOT NULL DEFAULT 'Session',
  "frequency" "series_frequency" NOT NULL,
  "duration_minutes" integer NOT NULL DEFAULT 60,
  "first_at" timestamp with time zone NOT NULL,
  "occurrence_count" integer NOT NULL,
  "intention" text,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "session_series_client_idx" ON "session_series" ("client_id");--> statement-breakpoint

-- Link sessions to a series
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "series_id" uuid REFERENCES "session_series"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "occurrence_index" integer;
