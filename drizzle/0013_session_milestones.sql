-- 0013_session_milestones.sql
--
-- Milestones — sessions she pins as named anchor moments ("first
-- breakthrough", "she said it out loud", "she let me see her cry").
-- Distinct from the Closing's "never forget" line: closings are the
-- THING she remembers, milestones are the NAME she gives it. Both
-- can coexist on the same session.
--
-- milestone_label: the name she wrote. Null = not a milestone.
-- milestone_at: when she pinned it (NOT when the session happened).
--               Distinct so we can show "marked 3 days later" if she
--               returns to a past session.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS milestone_label TEXT,
  ADD COLUMN IF NOT EXISTS milestone_at TIMESTAMP;
