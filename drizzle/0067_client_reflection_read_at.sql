-- When she's seen a reflection a client wrote in their portal.
--
-- Reflections were write-only from her side: the client typed something
-- between sessions, the row landed, and nothing anywhere told her. Now a
-- reflection emails her and shows on Today and in Requests — all of which
-- need an "unread" notion, or the count could never reach zero.
--
-- NULL = she hasn't marked it seen yet. Backfilled to now() for everything
-- that already exists, so turning this on doesn't greet her with a pile of
-- old reflections presented as new.
ALTER TABLE "client_reflections" ADD COLUMN IF NOT EXISTS "read_at" timestamp;
UPDATE "client_reflections" SET "read_at" = now() WHERE "read_at" IS NULL;
