-- Day-2 "go deeper one-to-one" invitation stamp — the Circle→session
-- conversion email. Applied to prod 2026-07-23 (ahead of deploy, per the
-- migrations-before-code rule).
ALTER TABLE group_attendees ADD COLUMN IF NOT EXISTS deeper_invite_sent_at timestamp;
