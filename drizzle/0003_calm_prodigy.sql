ALTER TABLE "practitioner_settings" ADD COLUMN "google_access_token" text;--> statement-breakpoint
ALTER TABLE "practitioner_settings" ADD COLUMN "google_refresh_token" text;--> statement-breakpoint
ALTER TABLE "practitioner_settings" ADD COLUMN "google_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "practitioner_settings" ADD COLUMN "google_calendar_email" text;--> statement-breakpoint
ALTER TABLE "practitioner_settings" ADD COLUMN "google_connected_at" timestamp;