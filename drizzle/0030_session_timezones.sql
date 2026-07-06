-- Per-recipient timezone support for reminder / confirmation emails.
--   sessions.timezone            — IANA zone captured from the browser at
--                                  schedule time ("the time she booked it in").
--   practitioner_settings.timezone — the practice's home zone (fallback/anchor).
-- clients.timezone already exists (varchar 64) for a client's own zone.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS timezone TEXT;

ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS timezone TEXT;
