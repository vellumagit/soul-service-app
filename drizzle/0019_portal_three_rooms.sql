-- 0019_portal_three_rooms.sql
--
-- The portal's three-room expansion: Today / The arc / Reflections.
--
-- Three additions:
--
-- 1. sessions.client_stated_intention — what the client writes for
--    themselves before a session, separate from the existing
--    sessions.intention (which the practitioner writes from her POV).
--    The two surface alongside each other in The Arc and in her
--    prep view, so she walks in already holding what the client
--    brought.
--
-- 2. sessions.client_visible_note — a short note the practitioner can
--    explicitly choose to share. Surfaces as "Since your last session…"
--    on the portal Today view + at the top of The Arc per-session row.
--    Optional; she controls what gets shared.
--
-- 3. client_reflections — the journal room. Free-form text entries the
--    client writes between sessions. Optionally attached to a specific
--    past session_id. Practitioner sees recent entries on the client
--    overview as the most valuable pre-session context.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS client_stated_intention TEXT,
  ADD COLUMN IF NOT EXISTS client_visible_note TEXT;

CREATE TABLE IF NOT EXISTS client_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Nullable — a reflection may be standalone ("just something I
  -- noticed this week") or tied to a particular session.
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,

  body TEXT NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_reflections_account_idx
  ON client_reflections(account_id);
CREATE INDEX IF NOT EXISTS client_reflections_client_idx
  ON client_reflections(client_id);
CREATE INDEX IF NOT EXISTS client_reflections_session_idx
  ON client_reflections(session_id);
