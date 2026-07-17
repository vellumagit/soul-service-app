-- In-person sessions. "online" (default) keeps today's behavior (Google Meet +
-- Recall notetaker bot). "in_person" skips Meet generation and the bot; she
-- records in the room with the in-app "Record session" button, which feeds the
-- same transcript/ai_summary/ai_summary_tldr pipeline as the remote notetaker.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "location_type" text DEFAULT 'online' NOT NULL;
