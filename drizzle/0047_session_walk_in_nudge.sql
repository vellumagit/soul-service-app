-- T-10 "walk in now" nudge for 1-on-1 sessions.
--
-- Circles have had this since 0042/0043; 1-on-1s never did, so the last thing
-- either side heard was the 1h heads-up. Two separate stamps because the two
-- halves are sent independently and either can fail on its own:
--   walk_in_nudge_sent_at         → the nudge to HER
--   client_walk_in_nudge_sent_at  → the nudge to the CLIENT
-- Same idempotency discipline as the Circle columns: claimed before send,
-- released back to NULL if the send throws.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "walk_in_nudge_sent_at" timestamp;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "client_walk_in_nudge_sent_at" timestamp;
