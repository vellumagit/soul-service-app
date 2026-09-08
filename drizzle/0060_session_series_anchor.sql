-- "Edit series" re-anchors the rhythm at the NEXT occurrence: first_at becomes
-- the instant of occurrence #anchor_index (1 at creation), and every later
-- occurrence is computed from there. Past rows are never recomputed.
ALTER TABLE "session_series" ADD COLUMN IF NOT EXISTS "anchor_index" integer NOT NULL DEFAULT 1;
