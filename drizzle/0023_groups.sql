-- 0023_groups.sql
--
-- Group session infrastructure. Distinct from 1-on-1 sessions because
-- groups break every assumption the `sessions` table makes (many
-- attendees, capacity, shared notes, shared Meet link, drop-in vs.
-- committed). Three new tables instead of polymorphism on sessions.
--
-- The Circle is the original use case ($20/session weekly group for
-- women), but the model is generic: any recurring or one-off group
-- offering — Workshop, Class, Retreat — uses the same shape.

-- A "Group" is the offering itself — The Circle, the Workshop, etc.
-- One template; many sessions get scheduled under it over time.
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  /** Default capacity per session (max attendees). Per-session override
   *  lives on group_sessions.capacity. */
  default_capacity INTEGER NOT NULL DEFAULT 20,
  default_duration_minutes INTEGER NOT NULL DEFAULT 120,
  /** Price per attendee per session, in cents. Per-session override
   *  lives on group_sessions.price_cents. */
  default_price_cents INTEGER NOT NULL DEFAULT 2000,
  default_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  /** Manual-payment instructions shown on the public signup confirmation
   *  (e.g. "Venmo @svit-lana $20 with the date in the note"). */
  payment_instructions TEXT,

  /** Visible on the storefront? When false, the group is private — only
   *  used internally + by direct link. */
  published BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS groups_account_idx ON groups(account_id);

-- A specific instance: "The Circle on Mar 18 at 7pm — theme: grief"
CREATE TABLE IF NOT EXISTS group_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,

  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120,
  capacity INTEGER NOT NULL DEFAULT 20,
  /** Per-session override of default_price_cents. */
  price_cents INTEGER NOT NULL DEFAULT 2000,

  /** Per-session theme — "grief", "boundaries", etc. */
  topic TEXT,

  /** scheduled | completed | cancelled */
  status TEXT NOT NULL DEFAULT 'scheduled',

  meet_url TEXT,
  google_event_id TEXT,

  /** Shared notes the practitioner writes after the session. ONE set per
   *  session, not per-attendee — unlike 1-on-1 sessions. */
  notes TEXT,

  /** Recall bot fields — same shape as on sessions; Phase 2 wires the
   *  bot lifecycle. */
  recall_bot_id TEXT,
  recall_bot_status TEXT,
  recall_transcript_received_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS group_sessions_group_idx ON group_sessions(group_id);
CREATE INDEX IF NOT EXISTS group_sessions_account_scheduled_idx
  ON group_sessions(account_id, scheduled_at);
CREATE INDEX IF NOT EXISTS group_sessions_public_listing_idx
  ON group_sessions(account_id, status, scheduled_at)
  WHERE status = 'scheduled';

-- One row per person signed up for a specific group session. Can be an
-- existing client (client_id set) or a fresh public sign-up (client_id
-- null, name + email captured at sign-up).
CREATE TABLE IF NOT EXISTS group_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  group_session_id UUID NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  /** Optional — links to an existing client row when one exists. */
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,

  /** pending | confirmed | cancelled */
  status TEXT NOT NULL DEFAULT 'pending',
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMP,
  payment_method TEXT,
  /** Was attendee actually present? Marked after the session. */
  attended BOOLEAN,

  /** Practitioner-only notes about this attendee for THIS session
   *  (e.g. "first time", "asked to be muted"). */
  practitioner_notes TEXT,

  source_ip TEXT,
  user_agent TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS group_attendees_session_idx
  ON group_attendees(group_session_id);
CREATE INDEX IF NOT EXISTS group_attendees_account_status_idx
  ON group_attendees(account_id, status);
CREATE INDEX IF NOT EXISTS group_attendees_email_per_session_idx
  ON group_attendees(group_session_id, email);
