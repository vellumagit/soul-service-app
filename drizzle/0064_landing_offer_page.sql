-- Which public page an offer belongs to (/womens-circle, /private-sessions,
-- /coaching). NULL = the offer only lives on the homepage ladder. The page
-- shows the offer's live price + words, and the homepage card links to it.
-- See src/lib/offering-pages.ts.
ALTER TABLE "landing_offers" ADD COLUMN IF NOT EXISTS "page" text;
--> statement-breakpoint
-- Point the original built-in offers at their pages (matched by the English
-- name they were created with). Anything renamed or new stays unlinked until
-- she picks a page in Settings → Offers.
UPDATE "landing_offers" SET "page" = CASE "title_en"
  WHEN 'The Circle' THEN 'womens-circle'
  WHEN 'A Single Session' THEN 'private-sessions'
  WHEN 'Monthly Retainer' THEN 'coaching'
  WHEN 'The 3-Month Journey' THEN 'coaching'
END
WHERE "page" IS NULL
  AND "title_en" IN ('The Circle', 'A Single Session', 'Monthly Retainer', 'The 3-Month Journey');
