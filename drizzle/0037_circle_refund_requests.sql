-- Client-initiated refund requests. Set when a paid attendee clicks "Can't
-- make it? Cancel & request a refund" in their email. Surfaces in the
-- practitioner's Loose Ends as a one-tap approval; approving issues the Stripe
-- refund (which frees the seat + emails them via the existing refund pipeline).
ALTER TABLE "group_attendees" ADD COLUMN IF NOT EXISTS "refund_requested_at" timestamp;
