ALTER TABLE "practitioner_settings" DROP COLUMN IF EXISTS "birthday_reminder_days";--> statement-breakpoint
ALTER TABLE "practitioner_settings" ADD COLUMN IF NOT EXISTS "auto_upload_ai_notes" boolean DEFAULT false NOT NULL;
