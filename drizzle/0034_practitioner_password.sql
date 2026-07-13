-- Practitioner password login. Optional per account: null = no password yet
-- (falls back to the existing email-link / instant flow so nobody is locked
-- out). Once set, sign-in requires the password or an emailed link. Stored as
-- a scrypt hash ("scrypt$N$r$p$salt$hash"), never plaintext. Clients are
-- unaffected — the portal stays magic-link only.

ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "password_hash" text;
