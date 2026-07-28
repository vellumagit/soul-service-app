-- Card payment for 1-on-1 sessions, paid by the client from /portal/billing.
--
-- Mirrors the Circle-seat columns on group_attendees: the checkout id lets us
-- expire a stale link before minting a new one, and the payment intent is what
-- a refund is issued against. Both NULL for sessions she settles by hand
-- (Venmo / cash / e-transfer), which stays the default lane.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" text;
