-- Per-attendee T-10 "walk in now" nudge stamp (the guest half; the host stamp
-- lives on group_sessions). Applied to prod 2026-07-24 before deploy.
ALTER TABLE group_attendees ADD COLUMN IF NOT EXISTS walk_in_nudge_sent_at timestamp;
