-- 0010_google_last_error.sql
--
-- Adds two columns to practitioner_settings so the most recent Google
-- Calendar sync failure for each account can be persisted and surfaced
-- on the Status page. Vercel Hobby tier doesn't retain server-action
-- logs long enough to debug intermittent sync failures the normal way,
-- so we let the row itself remember what went wrong.
--
-- syncSessionToGoogle writes here on failure, clears on success.

ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS google_last_error TEXT,
  ADD COLUMN IF NOT EXISTS google_last_error_at TIMESTAMP;
