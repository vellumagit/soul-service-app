-- Lazy recurring series: the session_series row becomes the durable source of
-- truth for (a) how far the series has been materialized and (b) its ONE
-- recurring Google event — instead of deriving both from session rows, which
-- go away (deleted / purged / cancelled) and caused occurrences to resurrect.
ALTER TABLE "session_series" ADD COLUMN IF NOT EXISTS "materialized_through_index" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "session_series" ADD COLUMN IF NOT EXISTS "google_recurring_event_id" text;
--> statement-breakpoint
ALTER TABLE "session_series" ADD COLUMN IF NOT EXISTS "meet_url" text;
--> statement-breakpoint
-- Every series that exists BEFORE this migration was bulk-materialized by the
-- old code (all N rows at once), so mark it fully materialized: the daily
-- top-up must never touch a legacy series — and never resurrect the purged
-- test ones. The date guard makes this safe to replay: a series created by the
-- new code that legitimately sits at 0 (starts beyond the horizon) is untouched.
UPDATE "session_series" SET "materialized_through_index" = "occurrence_count"
  WHERE "materialized_through_index" = 0 AND "created_at" < '2026-09-08T00:00:00Z';
--> statement-breakpoint
-- Hard guarantee that one series can never hold two rows for the same
-- occurrence, whatever races (overlapping cron ticks, a double top-up) occur.
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_series_occurrence_uniq"
  ON "sessions" ("series_id", "occurrence_index")
  WHERE "series_id" IS NOT NULL AND "occurrence_index" IS NOT NULL;
