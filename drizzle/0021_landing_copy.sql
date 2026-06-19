-- 0021_landing_copy.sql
--
-- Landing-page copy lives on practitioner_settings so the practitioner
-- can edit it from /settings without anyone touching code. Four optional
-- TEXT columns; the landing page falls back to sensible defaults if any
-- are NULL.

ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS landing_tagline TEXT,
  ADD COLUMN IF NOT EXISTS landing_about TEXT,
  ADD COLUMN IF NOT EXISTS landing_how_it_works TEXT,
  ADD COLUMN IF NOT EXISTS landing_what_to_expect TEXT;
