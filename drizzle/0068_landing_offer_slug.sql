-- A shareable address for each offer: svit.live/offer/<slug> (and /uk/…).
--
-- Offers were only cards on the homepage ladder — there was no link she could
-- send for "the holiday gift session" on its own. The slug is unique per
-- account; NULL = no link yet (the app assigns one on the next save).
ALTER TABLE "landing_offers" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
-- Give every existing offer a link straight away, from its English name
-- ("A Single Session" → "a-single-session"), numbering any repeats.
UPDATE "landing_offers" AS o
SET "slug" = s.slug
FROM (
  SELECT id,
         base || CASE WHEN rn > 1 THEN '-' || rn::text ELSE '' END AS slug
  FROM (
    SELECT id, base,
           row_number() OVER (PARTITION BY account_id, base ORDER BY created_at) AS rn
    FROM (
      SELECT id, account_id, created_at,
             COALESCE(
               NULLIF(left(trim(both '-' from lower(regexp_replace(
                 COALESCE(NULLIF(title_en, ''), NULLIF(title_uk, ''), 'offer'),
                 '[^a-zA-Z0-9]+', '-', 'g'))), 60), ''),
               'offer'
             ) AS base
      FROM "landing_offers"
      WHERE "slug" IS NULL
    ) a
  ) b
) s
WHERE o.id = s.id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "landing_offers_account_slug_idx"
  ON "landing_offers" ("account_id", "slug")
  WHERE "slug" IS NOT NULL;
