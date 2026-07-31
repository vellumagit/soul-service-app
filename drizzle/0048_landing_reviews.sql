-- Reviews she can add herself, shown in the "Voices" section of the storefront
-- (directly under "Ways to work together" / "Find your way in").
--
-- One row = one review = one photo + one position, with SEPARATE text per
-- language. Structure is shared across EN and UK; only the words differ. A
-- blank Ukrainian quote falls back to the English one at render time, so a
-- half-translated review never renders as an empty card.

CREATE TABLE IF NOT EXISTS landing_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  quote_en text NOT NULL DEFAULT '',
  quote_uk text NOT NULL DEFAULT '',
  author_en text NOT NULL DEFAULT '',
  author_uk text NOT NULL DEFAULT '',
  photo_url text,
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS landing_reviews_account_idx
  ON landing_reviews (account_id);
