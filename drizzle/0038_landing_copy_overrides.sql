-- Per-language storefront copy overrides, edited from Settings → Landing page.
-- Shape: { "en": { "heroTitle": "...", ... }, "uk": { ... } }
-- Any key that's absent/blank falls back to the hand-written dictionary in
-- src/lib/landing-copy.tsx, so a blank field always means "keep the default".
-- JSONB (not one column per field) so new editable blocks need no migration.
ALTER TABLE "practitioner_settings"
  ADD COLUMN IF NOT EXISTS "landing_copy_overrides" jsonb;
