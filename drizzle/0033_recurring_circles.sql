-- Recurring weekly Circles: when enabled on a group, a daily/hourly job keeps
-- the next N weeks filled with a session on a fixed weekday + time (interpreted
-- in the practice timezone), so the storefront always has an open seat to book
-- and she never has to schedule manually.
--
-- recurrence_weekday: 0=Sunday .. 6=Saturday (matches JS getUTCDay()).
-- recurrence_time:    "HH:MM" 24h, in the practice timezone.

ALTER TABLE "groups"
  ADD COLUMN IF NOT EXISTS "recurrence_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_weekday" integer,
  ADD COLUMN IF NOT EXISTS "recurrence_time" text,
  ADD COLUMN IF NOT EXISTS "recurrence_weeks_ahead" integer DEFAULT 4 NOT NULL;
