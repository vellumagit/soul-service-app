-- The storefront's sections, as rows she can reorder and hide.
--
-- The sections themselves are PRESET (hero, the ache, who I am, …) — this
-- table doesn't create them, it records her arrangement of them. A slug with
-- no row falls back to the built-in position, so shipping a new section never
-- requires a backfill.
--
-- Their WORDS still live in practitioner_settings.landing_copy_overrides,
-- keyed per language. This table is only order + visibility.

CREATE TABLE IF NOT EXISTS landing_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slug text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

-- One row per section per account. The unique index is what makes the
-- "insert her arrangement, on conflict update" seeding path safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS landing_sections_account_slug_idx
  ON landing_sections (account_id, slug);
