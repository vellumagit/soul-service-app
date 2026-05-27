-- 0011_session_closing.sql
--
-- The Closing Ritual. After she marks a session complete, the app offers
-- three quiet prompts she can answer (or skip) — the "closing" of a session,
-- distinct from session notes. Stored on the session row directly so the
-- timeline / arc views can read them cheaply.
--
-- closing_completed_at is set whenever she finishes the ritual (save OR
-- explicit skip), so the UI knows not to keep nagging. Re-opening the
-- ritual later updates these fields; the timestamp stays.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS closing_landed TEXT,
  ADD COLUMN IF NOT EXISTS closing_remember TEXT,
  ADD COLUMN IF NOT EXISTS closing_never_forget TEXT,
  ADD COLUMN IF NOT EXISTS closing_completed_at TIMESTAMP;
