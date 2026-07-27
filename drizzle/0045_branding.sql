-- Branding: her own logo + favicon, uploaded from Settings → Branding.
-- Both are Vercel Blob URLs (or any hosted image URL if she pastes one).
-- NULL = fall back to the wordmark / the app's built-in icon.
ALTER TABLE "practitioner_settings" ADD COLUMN IF NOT EXISTS "logo_url" text;
ALTER TABLE "practitioner_settings" ADD COLUMN IF NOT EXISTS "favicon_url" text;
