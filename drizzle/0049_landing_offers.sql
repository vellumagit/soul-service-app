-- The "Ways to work together" ladder — offers she can add, remove and reorder.
--
-- Same shape as landing_reviews: ONE row per offer carrying BOTH languages.
-- Structure (position, lane, card style, where the button goes) is shared;
-- only the words differ per language. Price is per-language too — "Free" and
-- "Безкоштовно" are different words even though "$150" isn't.
--
-- `description_*` not `desc_*`: DESC is a reserved word in SQL and an
-- unquoted desc_en column is a trap waiting for the first hand-written query.

CREATE TABLE IF NOT EXISTS landing_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  step_en text NOT NULL DEFAULT '',
  step_uk text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  title_uk text NOT NULL DEFAULT '',
  price_en text NOT NULL DEFAULT '',
  price_uk text NOT NULL DEFAULT '',
  price_suffix_en text NOT NULL DEFAULT '',
  price_suffix_uk text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_uk text NOT NULL DEFAULT '',
  cta_en text NOT NULL DEFAULT '',
  cta_uk text NOT NULL DEFAULT '',

  -- Where the button goes. 'circle' resolves at render time to the soonest
  -- bookable Circle (falling back to the contact form when sign-ups are shut),
  -- which is why it can't just be a stored URL.
  link_kind text NOT NULL DEFAULT 'contact',
  custom_href text,

  -- Card treatment: 'plain' | 'free' (soft entry card) | 'feature' (the
  -- highlighted one).
  variant text NOT NULL DEFAULT 'plain',
  -- Which row of the ladder: 'entry' (begin gently) | 'deep' (go deeper).
  lane text NOT NULL DEFAULT 'entry',

  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS landing_offers_account_idx
  ON landing_offers (account_id);
