-- Anchor the follow-up "flow" in time so adding one doesn't retroactively
-- blast everyone who already opted in.
--
-- Bug: the nurture cron enrolled every recent opt-in (createdAt + delay) with no
-- notion of WHEN the flow was set up. So a practitioner who added a "2 days
-- after sign-up" follow-up to a magnet that already had a week of sign-ups would
-- see everyone from 2–9 days ago emailed at once on the next tick.
--
-- Fix: record when a magnet's flow first became non-empty. The cron only sends
-- follow-ups to opt-ins captured at or after that moment — a flow applies going
-- forward, like any automation. Existing flows are anchored to now() so they
-- can't blast their back-catalogue either.

ALTER TABLE lead_magnets ADD COLUMN IF NOT EXISTS followups_set_at timestamp;
--> statement-breakpoint
UPDATE lead_magnets
  SET followups_set_at = now()
  WHERE jsonb_array_length(followups) > 0
    AND followups_set_at IS NULL;
