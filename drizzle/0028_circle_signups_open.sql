-- Master switch for public Circle sign-ups. OFF by default: the storefront
-- shows pricing + contact only, and the public sign-up page routes people
-- to reach out. Flip ON when payment + emails are ready.
ALTER TABLE practitioner_settings
  ADD COLUMN IF NOT EXISTS circle_signups_open BOOLEAN NOT NULL DEFAULT FALSE;
