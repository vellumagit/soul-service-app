-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tenancy: an `accounts` table + an `account_id` column on every
-- user-data table. For existing data (test DB), we create a default account
-- and backfill every row into it so the NOT NULL constraint applies cleanly.
-- For fresh databases (Svitlana's prod), this is a no-op backfill — tables
-- are empty, the constraint applies immediately.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. accounts table
CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "name" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- 2. Add account_id columns (nullable initially so we can backfill)
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "session_series" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "note_templates" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "practitioner_settings" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "important_people" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint

-- 3. Backfill: if any user data exists, create a default account and assign
--    every existing row to it. Idempotent — only runs once.
DO $$
DECLARE
  default_account_id uuid;
  existing_default uuid;
BEGIN
  -- Don't run if all tables are clean already (fresh DB)
  IF NOT EXISTS (
    SELECT 1 FROM clients
    UNION ALL SELECT 1 FROM sessions
    UNION ALL SELECT 1 FROM email_templates
    UNION ALL SELECT 1 FROM note_templates
    UNION ALL SELECT 1 FROM practitioner_settings
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  -- Don't run if we've already created the default
  SELECT id INTO existing_default
  FROM accounts WHERE email = 'default@local'
  LIMIT 1;

  IF existing_default IS NOT NULL THEN
    default_account_id := existing_default;
  ELSE
    INSERT INTO accounts (email, name)
    VALUES ('default@local', 'Legacy data')
    RETURNING id INTO default_account_id;
  END IF;

  UPDATE clients              SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE sessions             SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE session_series       SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE attachments          SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE goals                SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE tasks                SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE communications       SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE email_templates      SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE note_templates       SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE practitioner_settings SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE important_people     SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE themes               SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE observations         SET account_id = default_account_id WHERE account_id IS NULL;
END $$;--> statement-breakpoint

-- 4. NOT NULL constraints + foreign keys
ALTER TABLE "clients" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session_series" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "communications" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "note_templates" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "practitioner_settings" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "important_people" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "observations" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint

-- Add FK constraints (separate from NOT NULL because of dependency order)
DO $$ BEGIN
  ALTER TABLE "clients"             ADD CONSTRAINT "clients_account_fk"             FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sessions"            ADD CONSTRAINT "sessions_account_fk"            FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_series"      ADD CONSTRAINT "session_series_account_fk"      FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attachments"         ADD CONSTRAINT "attachments_account_fk"         FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goals"               ADD CONSTRAINT "goals_account_fk"               FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks"               ADD CONSTRAINT "tasks_account_fk"               FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "communications"      ADD CONSTRAINT "communications_account_fk"      FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_templates"     ADD CONSTRAINT "email_templates_account_fk"     FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "note_templates"      ADD CONSTRAINT "note_templates_account_fk"      FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "practitioner_settings" ADD CONSTRAINT "practitioner_settings_account_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "practitioner_settings" ADD CONSTRAINT "practitioner_settings_account_unique" UNIQUE ("account_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "important_people"    ADD CONSTRAINT "important_people_account_fk"    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "themes"              ADD CONSTRAINT "themes_account_fk"              FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "observations"        ADD CONSTRAINT "observations_account_fk"        FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "clients_account_idx"        ON "clients"("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_account_idx"       ON "sessions"("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_series_account_idx" ON "session_series"("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_account_idx"          ON "tasks"("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communications_account_idx" ON "communications"("account_id");--> statement-breakpoint

-- 6. Drop the unused magic_links table — we replaced magic-link auth with
--    simple email-submit. Safe to drop (no FKs reference it).
DROP TABLE IF EXISTS "magic_links";
