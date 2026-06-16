-- 0017_client_portal.sql
--
-- Client portal — a small, magic-link-auth surface where her clients log in
-- to see their upcoming sessions, request a reschedule, and view what they
-- owe. Intentionally tiny: no chat, no profile edits, no self-serve
-- cancellation. Soul work is held by the practitioner; the portal is just
-- a window the client can look through.
--
-- Auth shape (mirrors lead-tokens hashing pattern):
--   - magic links sent via Resend; cleartext token in URL, SHA-256 hash in DB
--   - clicking the link consumes the token (single-use) and sets a 30-day
--     httponly cookie whose value is hashed in client_portal_sessions
--   - sign-in form is anti-enumeration: success message regardless of whether
--     the email matches a portal-enabled client
--
-- Per-client opt-in: clients.portal_enabled defaults FALSE. The practitioner
-- flips it on per-person via EditClientDialog and then clicks "Send portal
-- invite" — the action emails the magic link.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_portal_visit_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS clients_portal_enabled_idx
  ON clients(account_id, portal_enabled) WHERE portal_enabled = TRUE;

-- One row per magic link sent. Short-lived (30 min default), single-use.
CREATE TABLE IF NOT EXISTS client_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- SHA-256(cleartext). Cleartext appears only in the emailed URL.
  token_hash TEXT NOT NULL UNIQUE,

  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,

  -- Useful for forensics if a link gets shared / leaked.
  requested_ip TEXT,
  requested_user_agent TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_portal_tokens_hash_idx
  ON client_portal_tokens(token_hash);
CREATE INDEX IF NOT EXISTS client_portal_tokens_client_idx
  ON client_portal_tokens(client_id);

-- One row per active client cookie. We store hashes (never cleartext) so a
-- DB leak doesn't hand an attacker a working session. Cookie expiry on the
-- browser side mirrors expires_at, but the server check is authoritative.
CREATE TABLE IF NOT EXISTS client_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  cookie_hash TEXT NOT NULL UNIQUE,

  expires_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),

  created_ip TEXT,
  created_user_agent TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_portal_sessions_cookie_idx
  ON client_portal_sessions(cookie_hash);
CREATE INDEX IF NOT EXISTS client_portal_sessions_client_idx
  ON client_portal_sessions(client_id);

-- Reschedule requests — client submits via /portal/sessions/<id>; practitioner
-- sees a chip on the client overview + a row in Loose ends. Not self-serve:
-- approval rewrites the session, decline just resolves the row.
CREATE TABLE IF NOT EXISTS reschedule_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  -- Free-text from the client ("can we push it a week — I'm out of town"),
  -- optional. Length-capped at the app layer.
  reason TEXT,
  -- Optional preferred alternatives, stored as ISO strings in a JSON array.
  -- The practitioner can copy-paste into the schedule dialog; we don't
  -- auto-apply (intentional friction).
  preferred_times JSONB,

  -- pending | acknowledged | resolved
  -- pending = freshly submitted; acknowledged = she's seen it but not yet
  -- acted; resolved = the underlying session was rescheduled OR she dismissed.
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP,
  reviewed_note TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reschedule_requests_account_status_idx
  ON reschedule_requests(account_id, status);
CREATE INDEX IF NOT EXISTS reschedule_requests_client_idx
  ON reschedule_requests(client_id);
CREATE INDEX IF NOT EXISTS reschedule_requests_session_idx
  ON reschedule_requests(session_id);
