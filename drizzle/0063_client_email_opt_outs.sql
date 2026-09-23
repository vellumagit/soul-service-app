-- Per-person email preferences. Lists the kinds of automated email this
-- client should NOT receive: 'reminders', 'bookings', 'portal', 'circles', or
-- 'all' for none at all. Empty (the default) keeps today's behaviour —
-- everyone gets everything. See src/lib/email-prefs.ts.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "email_opt_outs" text[] NOT NULL DEFAULT '{}';
