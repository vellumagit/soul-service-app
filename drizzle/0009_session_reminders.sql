-- Reminder bookkeeping on sessions
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "client_reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "practitioner_reminder_sent_at" timestamp;--> statement-breakpoint

-- Reminder windows on practitioner settings (default: 24h client, 1h practitioner)
ALTER TABLE "practitioner_settings"
  ADD COLUMN IF NOT EXISTS "client_reminder_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "practitioner_settings"
  ADD COLUMN IF NOT EXISTS "practitioner_reminder_hours" integer DEFAULT 1 NOT NULL;
