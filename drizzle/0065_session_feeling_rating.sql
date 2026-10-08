-- "How they're feeling" 1–10 per session — set on the session card, drawn as
-- the height of each dot on the Journey arc. Null = not rated.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "feeling_rating" integer;
DO $$ BEGIN
  ALTER TABLE "sessions" ADD CONSTRAINT "sessions_feeling_rating_range"
    CHECK ("feeling_rating" IS NULL OR "feeling_rating" BETWEEN 1 AND 10);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
