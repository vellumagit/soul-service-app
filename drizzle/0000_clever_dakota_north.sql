CREATE TYPE "public"."document_type" AS ENUM('note', 'intake', 'consent', 'recording', 'altar_photo', 'voice_memo', 'letter');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'outstanding', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."reading_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."reading_type" AS ENUM('soul_reading', 'heart_clearing', 'ancestral_reading', 'love_alignment', 'inner_child', 'forgiveness_ritual', 'first_reading_intake', 'reconnection_call', 'cord_cutting');--> statement-breakpoint
CREATE TYPE "public"."soul_status" AS ENUM('active', 'new', 'dormant', 'archived');--> statement-breakpoint
CREATE TYPE "public"."timeline_event_kind" AS ENUM('session_upcoming', 'session', 'note', 'upload', 'invoice_paid', 'invoice_overdue', 'intake_pending', 'file_open', 'voice_memo', 'manual');--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"soul_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL,
	"signed_at" date,
	"expires_at" date,
	"document_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"soul_id" uuid NOT NULL,
	"reading_id" uuid,
	"name" text NOT NULL,
	"type" "document_type" NOT NULL,
	"storage_url" text NOT NULL,
	"size_bytes" integer,
	"mime_type" varchar(128),
	"expires_at" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"soul_id" uuid NOT NULL,
	"label" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"note" text,
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"soul_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(32) NOT NULL,
	"soul_id" uuid NOT NULL,
	"reading_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"issued_at" date NOT NULL,
	"due_at" date,
	"paid_at" date,
	"status" "invoice_status" DEFAULT 'sent' NOT NULL,
	"description" text,
	"stripe_payment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"soul_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"soul_id" uuid NOT NULL,
	"type" "reading_type" NOT NULL,
	"status" "reading_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"intention" text,
	"pre_heart_open" integer,
	"pre_self_love" integer,
	"pre_body" text,
	"post_heart_open" integer,
	"post_self_love" integer,
	"post_body" text,
	"log" text,
	"meet_url" text,
	"google_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "souls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(16) NOT NULL,
	"full_name" text NOT NULL,
	"pronouns" varchar(32),
	"dob" date,
	"email" text,
	"phone" varchar(32),
	"city" text,
	"timezone" varchar(64),
	"pinned_note" text,
	"working_on" text,
	"source" text,
	"primary_reading_type" "reading_type",
	"status" "soul_status" DEFAULT 'active' NOT NULL,
	"emergency_name" text,
	"emergency_phone" varchar(32),
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avatar_tone" varchar(16) DEFAULT 'ink',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "souls_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"soul_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"soul_id" uuid NOT NULL,
	"kind" timeline_event_kind NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"reading_id" uuid,
	"document_id" uuid,
	"invoice_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reading_id_readings_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."readings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_answers" ADD CONSTRAINT "intake_answers_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reading_id_readings_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."readings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_reading_id_readings_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."readings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_soul_idx" ON "documents" USING btree ("soul_id");--> statement-breakpoint
CREATE INDEX "documents_type_idx" ON "documents" USING btree ("type");--> statement-breakpoint
CREATE INDEX "readings_soul_idx" ON "readings" USING btree ("soul_id");--> statement-breakpoint
CREATE INDEX "readings_scheduled_idx" ON "readings" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "readings_status_idx" ON "readings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "souls_status_idx" ON "souls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "souls_name_idx" ON "souls" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "timeline_soul_occurred_idx" ON "timeline_events" USING btree ("soul_id","occurred_at");