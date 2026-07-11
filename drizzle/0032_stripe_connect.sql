-- Stripe Connect (Standard accounts + OAuth).
--
-- Lets the practitioner connect her OWN Stripe account in one click, so
-- Circle card payments are charged DIRECTLY on her account (she is the
-- merchant of record, sees the charges natively, and the money is 100%
-- hers). The platform key + STRIPE_CONNECT_CLIENT_ID live in env; here we
-- only store her connected account id + cached capability flags.
--
-- Flow: /api/integrations/stripe/connect issues a one-time CSRF state
-- (stripe_oauth_states) and redirects to Stripe's consent screen; the
-- /callback exchanges the code for her acct_… id and writes it here.

ALTER TABLE "practitioner_settings"
  ADD COLUMN IF NOT EXISTS "stripe_account_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_account_type" text,
  ADD COLUMN IF NOT EXISTS "stripe_charges_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_details_submitted" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_connected_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "stripe_disconnected_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "stripe_oauth_states" (
  "state" text PRIMARY KEY,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "stripe_oauth_states_account_idx"
  ON "stripe_oauth_states" ("account_id");
