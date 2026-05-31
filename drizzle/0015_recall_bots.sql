-- 0015_recall_bots.sql
--
-- Recall.ai integration: a meeting-bot joins Svit's Google Meet sessions
-- automatically, records, transcribes, and webhooks the transcript back
-- to /api/webhooks/recall. Auto-attached to the matching session, the
-- transcript is then structured by Claude into the session notes —
-- end-to-end "magic" auto-notes.
--
-- Per-session state on `sessions`:
--   recall_bot_id                — Recall's UUID for the bot we created.
--                                  Null = no bot scheduled for this session.
--   recall_bot_status            — Latest bot.status_change.code from Recall:
--                                  joining_call, in_call_recording, done,
--                                  fatal, etc. Drives the chip on the card.
--   recall_transcript_received_at — Timestamp the transcript webhook fired
--                                  and we successfully attached notes. Lets
--                                  us show "✓ Auto-notes" instead of
--                                  re-running the pipeline.
--
-- Per-account settings on `practitioner_settings`:
--   recall_enabled    — Master switch. False until she's read the consent
--                       copy and turned it on.
--   recall_bot_name   — What the bot appears as in the call ("Notetaker",
--                       "Svit's notes", etc.). Default kept neutral.
--   recall_auto_add   — When true, every new scheduled session with a Meet
--                       URL automatically gets a bot. When false she has
--                       to use the per-session "Add bot now" button.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recall_bot_id TEXT,
  ADD COLUMN IF NOT EXISTS recall_bot_status TEXT,
  ADD COLUMN IF NOT EXISTS recall_transcript_received_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS sessions_recall_bot_idx ON sessions(recall_bot_id);

ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS recall_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recall_bot_name TEXT DEFAULT 'Notetaker',
  ADD COLUMN IF NOT EXISTS recall_auto_add BOOLEAN NOT NULL DEFAULT TRUE;
