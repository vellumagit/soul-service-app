-- Auto-onboard a client to the portal when their lead/inquiry is accepted.
-- When true (default), acceptLeadSubmission enables portal access + emails
-- a sign-in link to the new client (only if they have a valid email).
ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS auto_portal_invite_on_accept BOOLEAN NOT NULL DEFAULT TRUE;
