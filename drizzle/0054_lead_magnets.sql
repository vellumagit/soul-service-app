-- lead_magnets — free, email-gated resources (a PDF, an image, or a pasted
-- video link) she creates to grow her list. Public page: /free/<slug>. A
-- visitor enters name + email, the asset is delivered instantly by email, and
-- the opt-in is written to lead_submissions so it shows in /network/inbox and
-- can be promoted to a client. Optional follow-up emails ("the flow") live in
-- the `followups` JSONB and are sent later by the reminders cron.
--
-- Bilingual like the rest of the storefront: every visitor-facing string has an
-- _en and _uk value; a blank one falls back to the other language at render.
-- `description_*` not `desc_*` — DESC is a reserved word (see 0049).

CREATE TABLE IF NOT EXISTS lead_magnets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- The public page is /free/<slug>. Unique per account.
  slug text NOT NULL,

  -- Visitor-facing copy (bilingual; blank falls back at render time).
  title_en text NOT NULL DEFAULT '',
  title_uk text NOT NULL DEFAULT '',
  subtitle_en text NOT NULL DEFAULT '',
  subtitle_uk text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_uk text NOT NULL DEFAULT '',
  button_en text NOT NULL DEFAULT '',
  button_uk text NOT NULL DEFAULT '',

  -- The gated asset. asset_kind is 'pdf' | 'image' | 'video_link' (plain text
  -- rather than an enum so new kinds don't need a type migration).
  asset_kind text NOT NULL DEFAULT 'pdf',
  -- Blob URL for pdf/image; the external URL for video_link.
  asset_url text,
  -- Original filename / display name for the download.
  asset_name text,
  -- Delivery button label (bilingual), e.g. "Download the workbook".
  asset_label_en text NOT NULL DEFAULT '',
  asset_label_uk text NOT NULL DEFAULT '',

  -- Optional next-step CTA shown after opt-in (bilingual). Blank = hidden.
  cta_label_en text NOT NULL DEFAULT '',
  cta_label_uk text NOT NULL DEFAULT '',
  cta_href text,

  -- Follow-up "flow": ordered emails sent after the opt-in, each shaped
  -- { delayHours, subjectEn, subjectUk, bodyEn, bodyUk }. Empty = deliver-only.
  followups jsonb NOT NULL DEFAULT '[]'::jsonb,

  published boolean NOT NULL DEFAULT false,
  -- Denormalized opt-in counter, like lead_forms.submission_count.
  optin_count integer NOT NULL DEFAULT 0,
  archived_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS lead_magnets_account_idx
  ON lead_magnets (account_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS lead_magnets_account_slug_idx
  ON lead_magnets (account_id, slug);
