-- Tier-1 payment-integrity fixes.
--
--  * sessions.duplicate_charge_payment_intent_id — a SECOND card payment intent
--    that landed on an already-paid session. Non-null flags the row for review
--    on /payments so a possible double charge isn't invisible in-app.
--  * sessions.refunded_at — set when a session's card payment is fully refunded
--    from Stripe (charge.refunded webhook). The same event flips paid → false
--    so revenue totals self-correct; this records it was a refund, not unpaid.
--  * group_attendees.duplicate_charge_payment_intent_id — same double-charge
--    flag for Circle seats.
--  * sessions_invoice_number_per_account_idx — invoice numbers are unique per
--    account. The atomic allocator in invoices.tsx prevents duplicates; this
--    partial unique index makes any remaining slip fail loudly. Partial because
--    only invoiced rows carry a number (the rest are NULL and exempt).
--
-- NOTE: if the sessions table already holds DUPLICATE (account_id, invoice_number)
-- pairs, the CREATE UNIQUE INDEX will fail — and migrate.ts swallows errors whose
-- message contains "duplicate", so it would be skipped silently. Before applying,
-- confirm there are none:
--   SELECT account_id, invoice_number, COUNT(*) FROM sessions
--   WHERE invoice_number IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "duplicate_charge_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "refunded_at" timestamp;--> statement-breakpoint
ALTER TABLE "group_attendees" ADD COLUMN IF NOT EXISTS "duplicate_charge_payment_intent_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_invoice_number_per_account_idx"
  ON "sessions" ("account_id", "invoice_number")
  WHERE "invoice_number" IS NOT NULL;
