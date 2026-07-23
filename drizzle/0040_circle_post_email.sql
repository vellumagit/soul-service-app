-- Post-Circle "thank you + come again" email, sent to each attendee once after
-- the Circle ends. Stamped per-attendee (like the reminder stamps) so repeat
-- cron runs never double-send.
ALTER TABLE "group_attendees"
  ADD COLUMN IF NOT EXISTS "post_circle_sent_at" timestamp;
