-- 0016_lead_capture.sql
--
-- Lead capture pipeline. External lead-magnet forms (her website, Substack,
-- Notion, embedded widgets, server-to-server from Make.com scenarios) POST
-- to /api/leads/intake with a per-form Bearer token. Each submission lands
-- in lead_submissions for triage on /network/inbox — or, if the form is
-- marked auto_accept, immediately becomes a Network entry (clients row with
-- is_lead=true).
--
-- Soul Service intentionally does NOT send the thank-you / drip / mailing-
-- list-sync emails. Each form can carry an outbound webhook_url that fires
-- on every new submission; Brian wires that into Make.com scenarios for
-- everything downstream. This keeps Soul Service in the practitioner-tool
-- lane and out of the marketing-automation lane.

CREATE TABLE IF NOT EXISTS lead_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Human-readable label ("Grief PDF download", "Newsletter signup").
  name TEXT NOT NULL,
  -- Url-safe identifier (e.g. "grief-pdf"). We don't currently use this in
  -- the endpoint path (auth is purely the token), but it's useful as a
  -- stable display key and may be surfaced in webhook payloads.
  slug TEXT NOT NULL,

  -- The Bearer token she copies into her form's auth header. Stored as a
  -- SHA-256 hash so a DB read doesn't leak it. token_prefix holds the
  -- first 8 chars of the cleartext so the UI can show "lf_AbC1…" without
  -- needing the cleartext after creation. The full cleartext is shown
  -- exactly once at creation and after a rotate.
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,

  -- When true, a submission to this form goes straight into the Network as
  -- a clients row (is_lead = true) without sitting in the inbox. Used for
  -- trusted sources only — start at FALSE.
  auto_accept BOOLEAN NOT NULL DEFAULT FALSE,
  -- Pre-set "what this form is about" string written into the resulting
  -- client's howTheyFoundMe / source on accept. Saves typing.
  default_intent TEXT,

  -- Optional outbound webhook. Fires on every submission (BEFORE inbox
  -- review — Make.com wants the raw lead instantly). Soul Service does
  -- NOT send any email itself; this is the seam.
  webhook_url TEXT,

  -- Soft counters maintained by the intake endpoint for the forms page.
  submission_count INTEGER NOT NULL DEFAULT 0,
  last_submission_at TIMESTAMP,

  archived_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_forms_account_idx ON lead_forms(account_id);
CREATE INDEX IF NOT EXISTS lead_forms_token_hash_idx ON lead_forms(token_hash);

CREATE TABLE IF NOT EXISTS lead_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES lead_forms(id) ON DELETE CASCADE,

  -- Canonical fields extracted from the payload for easy listing.
  name TEXT,
  email TEXT,
  phone TEXT,

  -- Everything else the form sent — UTM params, custom questions, any
  -- shape Brian wants to support without a schema migration.
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Request metadata for spam / abuse triage.
  source_ip TEXT,
  user_agent TEXT,
  referer TEXT,

  -- pending | accepted | rejected | duplicate. Inbox lists pending; counters
  -- on /network/forms aggregate by status.
  status TEXT NOT NULL DEFAULT 'pending',
  -- When she accepts, this is the clients row that got created.
  promoted_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  reviewed_action TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_submissions_account_idx ON lead_submissions(account_id);
CREATE INDEX IF NOT EXISTS lead_submissions_form_idx ON lead_submissions(form_id);
CREATE INDEX IF NOT EXISTS lead_submissions_status_idx
  ON lead_submissions(account_id, status);
CREATE INDEX IF NOT EXISTS lead_submissions_email_dedup_idx
  ON lead_submissions(form_id, email);
