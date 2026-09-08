-- A recurring series is online (Meet + notetaker) or in person (no Meet, no
-- bot — she records in the room), same as a single session. Stored on the
-- series so rows the cron materializes later inherit it.
ALTER TABLE "session_series" ADD COLUMN IF NOT EXISTS "location_type" text NOT NULL DEFAULT 'online';
