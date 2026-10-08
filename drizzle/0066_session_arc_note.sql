-- A short note pinned to a session's dot on the Journey arc ("Your work
-- together"). Edited from the arc or the session card. Practitioner-only.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "arc_note" text;
