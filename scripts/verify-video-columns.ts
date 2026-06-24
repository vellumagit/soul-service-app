// Applies migrations 0024 + 0025 in one shot:
//   - recap_video_* columns on sessions
//   - products + product_purchases tables
import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // 0024: recap columns on sessions
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recap_video_id TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recap_video_uploaded_at TIMESTAMP`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recap_video_duration_seconds INTEGER`;

  // 0025: products
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency VARCHAR(8) NOT NULL DEFAULT 'USD',
      video_id TEXT,
      video_uploaded_at TIMESTAMP,
      video_duration_seconds INTEGER,
      payment_instructions TEXT,
      published BOOLEAN NOT NULL DEFAULT FALSE,
      archived_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS products_account_idx ON products(account_id)`;

  await sql`
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
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS product_purchases_product_idx ON product_purchases(product_id)`;
  await sql`CREATE INDEX IF NOT EXISTS product_purchases_account_status_idx ON product_purchases(account_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS product_purchases_email_idx ON product_purchases(purchaser_email)`;

  // Sanity checks
  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name LIKE 'recap_video%'
    ORDER BY column_name
  `) as Array<{ column_name: string }>;
  console.log("Recap columns on sessions:");
  for (const c of cols) console.log(`  ${c.column_name}`);

  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('products','product_purchases')
    ORDER BY table_name
  `) as Array<{ table_name: string }>;
  console.log("Product tables present:");
  for (const t of tables) console.log(`  ${t.table_name}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
