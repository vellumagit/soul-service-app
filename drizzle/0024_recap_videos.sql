-- Recap videos for sessions, hosted on Cloudflare Stream.
-- recap_video_id is the Cloudflare video UID (opaque, ~32 chars).
-- We store it on the session row so look-ups stay simple.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recap_video_id TEXT,
  ADD COLUMN IF NOT EXISTS recap_video_uploaded_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS recap_video_duration_seconds INTEGER;
