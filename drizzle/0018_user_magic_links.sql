-- 0018_user_magic_links.sql
--
-- Practitioner magic-link auth. Mirrors client_portal_tokens but keyed by
-- email rather than client_id — practitioners are bootstrapped from email
-- on first sign-in via getOrCreateAccount, so the link itself doesn't
-- need to know about accounts at create time.
--
-- The flow:
--   1. Practitioner types email on /signin
--   2. If allowlisted (env var ALLOWED_EMAILS), we generate a token, hash
--      with SHA-256, insert here, and email the cleartext link via Resend
--   3. Anti-enumeration: same "check your email" message regardless of
--      allowlist match
--   4. Click /signin/<token> → consume row (atomic via WHERE consumed_at
--      IS NULL) → setSessionCookie → redirect /

CREATE TABLE IF NOT EXISTS user_magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  requested_ip TEXT,
  requested_user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_magic_links_hash_idx ON user_magic_links(token_hash);
CREATE INDEX IF NOT EXISTS user_magic_links_email_idx ON user_magic_links(email);
