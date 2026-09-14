-- "Sessions are free for this client" — a pro-bono / family / trade client
-- whose every session should record as gifted (no charge) without her
-- marking each one. Read at booking, back-fill, series top-up and completion.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "free_sessions" boolean NOT NULL DEFAULT false;
