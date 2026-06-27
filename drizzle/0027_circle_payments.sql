-- Stripe-paid Circle seats + automated fulfillment.
ALTER TABLE group_attendees
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMP;

-- Standing meeting-room link reused for every Circle.
ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS circle_room_url TEXT;
