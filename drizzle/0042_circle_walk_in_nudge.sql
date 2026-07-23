-- T-10 "walk in now" nudge stamp for Circles. Applied to prod 2026-07-23
-- ahead of deploy, per the migrations-before-code rule.
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS walk_in_nudge_sent_at timestamp;
