CREATE TYPE "public"."attachment_kind" AS ENUM('note', 'intake', 'consent', 'recording', 'photo', 'other');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'new', 'dormant', 'archived');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('venmo', 'zelle', 'etransfer', 'cash', 'paypal', 'stripe', 'other');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"session_id" uuid,
	"name" text NOT NULL,
	"kind" "attachment_kind" DEFAULT 'other' NOT NULL,
	"url" text NOT NULL,
	"pathname" text,
	"size_bytes" integer,
	"mime_type" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"avatar_url" text,
	"pronouns" varchar(32),
	"dob" date,
	"email" text,
	"phone" varchar(32),
	"city" text,
	"timezone" varchar(64),
	"about_client" text,
	"working_on" text,
	"intake_notes" text,
	"how_they_found_me" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"primary_session_type" text,
	"emergency_name" text,
	"emergency_phone" varchar(32),
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"label" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"note" text,
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"type" text DEFAULT 'Soul reading' NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"intention" text,
	"arrived_as" text,
	"left_as" text,
	"notes" text,
	"meet_url" text,
	"google_event_id" text,
	"paid" boolean DEFAULT false NOT NULL,
	"payment_method" "payment_method",
	"payment_amount_cents" integer,
	"paid_at" date,
	"payment_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_client_idx" ON "attachments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_client_idx" ON "sessions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "sessions_scheduled_idx" ON "sessions" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "sessions_status_idx" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_paid_idx" ON "sessions" USING btree ("paid");