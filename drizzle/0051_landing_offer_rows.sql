-- Rows of the offer ladder become hers to create, instead of the two
-- hardcoded lanes ("Begin gently" / "Go deeper").
--
-- She can now add a row called "Events", "Workshops", "Retreats" — anything —
-- put offers in it, and order the rows on the page.
--
-- Each row carries an OPTIONAL heading in both languages. Blank heading =
-- renders exactly as the ladder does today (bare row of cards, no title),
-- which is what the two migrated rows get, so nothing on her live page moves.
--
-- ON DELETE RESTRICT on the offer's row_id is deliberate: deleting a row that
-- still holds offers should fail loudly rather than silently take her cards
-- off the page.

CREATE TABLE IF NOT EXISTS landing_offer_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title_en text NOT NULL DEFAULT '',
  title_uk text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS landing_offer_rows_account_idx
  ON landing_offer_rows (account_id);

-- Nullable + no drop of `lane` in this migration: migrations run BEFORE the
-- new code deploys, so the currently-running build must keep working. It reads
-- `lane`, which stays put. The backfill script fills row_id for every existing
-- offer, and the new code reads row_id.
ALTER TABLE landing_offers
  ADD COLUMN IF NOT EXISTS row_id uuid
  REFERENCES landing_offer_rows(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS landing_offers_row_idx
  ON landing_offers (row_id);
