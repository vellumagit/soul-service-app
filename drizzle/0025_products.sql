-- Storefront video products — workshop replays, recorded courses, anything
-- she sells as on-demand video. One row per offering. video_id holds the
-- Cloudflare Stream UID.
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  -- Cloudflare Stream video UID. Null while she's still composing the
  -- product before uploading the video.
  video_id TEXT,
  video_uploaded_at TIMESTAMP,
  video_duration_seconds INTEGER,
  -- Public-facing instructions (mirrors the groups payment_instructions
  -- pattern — she emails the link after manually confirming payment).
  payment_instructions TEXT,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS products_account_idx ON products(account_id);
CREATE INDEX IF NOT EXISTS products_published_idx ON products(account_id, published)
  WHERE archived_at IS NULL;

-- One row per purchase request. Status flow:
--   pending   → buyer submitted the form, hasn't paid yet
--   confirmed → she marked paid + confirmed (and emailed them the watch link)
--   refunded  → she refunded; access_token is invalidated
-- access_token is the opaque secret in the /watch/[purchase_id]?token=…
-- URL. Stored in plain text since it's the equivalent of the email link;
-- rotating it requires sending a new email anyway.
CREATE TABLE IF NOT EXISTS product_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  purchaser_name TEXT NOT NULL,
  purchaser_email TEXT NOT NULL,
  purchaser_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMP,
  payment_method TEXT,
  access_token TEXT NOT NULL,
  confirmed_at TIMESTAMP,
  practitioner_notes TEXT,
  source_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS product_purchases_product_idx ON product_purchases(product_id);
CREATE INDEX IF NOT EXISTS product_purchases_account_status_idx ON product_purchases(account_id, status);
CREATE INDEX IF NOT EXISTS product_purchases_email_idx ON product_purchases(purchaser_email);
