ALTER TABLE "practitioner_settings" ADD COLUMN IF NOT EXISTS "ui_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "preferred_language" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'en' NOT NULL;
