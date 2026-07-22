-- "Your Circle starts soon" reminder to the PRACTITIONER (one per occurrence).
-- Attendee reminders are stamped per-attendee (reminder_24h/1h_sent_at); the
-- host gets a single email per circle session, so the stamp lives here.
ALTER TABLE "group_sessions"
  ADD COLUMN IF NOT EXISTS "host_reminded_at" timestamp;
