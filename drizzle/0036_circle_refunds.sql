-- Circle refund tracking. When a FULL refund is issued in Stripe, the webhook
-- (charge.refunded) stamps refunded_at and cancels the attendee row — freeing
-- the seat and recording the refund. Nullable; only set for refunded card seats.
ALTER TABLE "group_attendees" ADD COLUMN IF NOT EXISTS "refunded_at" timestamp;
