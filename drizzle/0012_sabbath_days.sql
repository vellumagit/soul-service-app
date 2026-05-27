-- 0012_sabbath_days.sql
--
-- Adds the practitioner's weekly off-days ("Sabbath") to the settings row.
-- Stored as a text[] of lowercase ISO weekday names: "monday", "tuesday", ...
-- Default empty — she opts into honoring days off, the app doesn't impose.

ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS sabbath_days TEXT[] NOT NULL DEFAULT '{}';
