-- Portrait photo URL for the landing "About" section. Blank → placeholder.
ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS landing_portrait_url TEXT;
