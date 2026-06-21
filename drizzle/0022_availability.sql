-- 0022_availability.sql
--
-- Availability config on practitioner_settings — drives smart scheduling
-- on Svit's side (conflict warnings in ScheduleSessionDialog) and the
-- public "available windows" hint on the storefront inquiry form.
--
-- working_hours is JSONB so the shape is editable without migrations:
--   {
--     "mon": { "from": "09:00", "to": "17:00" },
--     "tue": { "from": "09:00", "to": "17:00" },
--     ...
--     "sun": null
--   }
-- Days missing or null = not working that day. Sabbath_days (from an
-- earlier migration) is the legacy way and still honored, but
-- working_hours is the more granular source.

ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS working_hours JSONB,
  ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS default_session_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS show_availability_publicly BOOLEAN NOT NULL DEFAULT FALSE;
