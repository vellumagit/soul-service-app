-- Circle language ('en' | 'uk') — lives on the GROUP so recurring sessions,
-- storefront cards and the public page all inherit it. Applied to prod
-- 2026-07-24 before deploy.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
