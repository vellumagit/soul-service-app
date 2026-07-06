-- Split the notetaker output into three distinct, separately-stored fields so
-- each has its own home in the UI:
--   sessions.notes            — HER own notes (unchanged)
--   sessions.ai_summary_tldr  — Claude's 2–3 sentence "at a glance"
--   sessions.ai_summary       — Claude's structured summary (markdown)
--   sessions.transcript       — the full verbatim, speaker-attributed transcript
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS transcript TEXT;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS ai_summary_tldr TEXT;
