import "server-only";

// Turn a finished Recall transcript into the session's "From the meeting"
// panel: verbatim transcript + Claude's summary + at-a-glance. Shared by the
// `transcript.done` webhook and the cron's status poll, so notes land even
// when webhooks don't (which is exactly what happened in September 2026:
// every status after "joining" went missing and the card said "queued"
// while Recall had long since given up).
//
// Idempotent: the final write is gated on recall_transcript_received_at
// still being NULL, so a webhook and a poll racing each other produce one
// set of notes, not two.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, sessions } from "@/db/schema";
import { fetchTranscriptText } from "./recall";
import { generateNotesFromTranscript } from "./ai-notes";

export type AttachResult =
  | { ok: true; attached: true }
  | { ok: true; attached: false; reason: "already" | "too_short" | "raced" }
  | { ok: false; error: string };

export async function attachTranscriptToSession(input: {
  accountId: string;
  sessionId: string;
  transcriptId: string;
}): Promise<AttachResult> {
  const { accountId, sessionId, transcriptId } = input;
  const [row] = await db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      type: sessions.type,
      transcriptReceivedAt: sessions.recallTranscriptReceivedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
    .limit(1);
  if (!row) return { ok: false, error: "session not found" };
  if (row.transcriptReceivedAt) return { ok: true, attached: false, reason: "already" };

  const fetched = await fetchTranscriptText(transcriptId);
  if (fetched.text.trim().length < 50) {
    console.warn(
      `[recall] transcript too short (${fetched.text.length} chars) for sessionId="${sessionId}"`
    );
    return { ok: true, attached: false, reason: "too_short" };
  }

  // Persist the verbatim transcript FIRST, before the (fallible) Claude step —
  // the full transcript survives even if summarization errors out.
  await db
    .update(sessions)
    .set({ transcript: fetched.text, updatedAt: new Date() })
    .where(
      and(
        eq(sessions.accountId, accountId),
        eq(sessions.id, sessionId),
        isNull(sessions.recallTranscriptReceivedAt)
      )
    );

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.accountId, accountId), eq(clients.id, row.clientId)))
    .limit(1);

  const generated = await generateNotesFromTranscript({
    transcript: fetched.text,
    clientFirstName: client?.fullName.split(" ")[0] ?? client?.fullName ?? null,
    clientWorkingOn: client?.workingOn ?? null,
    sessionType: row.type,
  });

  // The three notetaker fields — kept SEPARATE from `notes` (her own writing).
  // Gated on transcriptReceivedAt STILL being null at the moment of UPDATE so
  // two concurrent runs can't both attach.
  const updated = await db
    .update(sessions)
    .set({
      transcript: fetched.text,
      aiSummary: generated.notes,
      aiSummaryTldr: generated.tldr || null,
      recallTranscriptReceivedAt: new Date(),
      recallBotStatus: "done",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sessions.accountId, accountId),
        eq(sessions.id, sessionId),
        isNull(sessions.recallTranscriptReceivedAt)
      )
    )
    .returning({ id: sessions.id });
  if (updated.length === 0) return { ok: true, attached: false, reason: "raced" };
  return { ok: true, attached: true };
}
