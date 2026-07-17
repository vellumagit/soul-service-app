"use server";

// In-person recording → notes. The browser records the session, uploads the
// audio (uploadVoiceMemo), transcribes it (/api/transcribe, Whisper), then
// calls this action with the finished transcript. We structure it into the
// SAME three notetaker fields the remote Recall pipeline writes
// (transcript / aiSummary / aiSummaryTldr), so an in-person session shows the
// identical "From the meeting" panel as an online one.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, clients } from "@/db/schema";
import { requireSession } from "./session-cookies";
import { generateNotesFromTranscript } from "./ai-notes";

export type AttachTranscriptResult =
  | { ok: true; summaryChars: number }
  | { ok: false; error: string };

export async function attachInPersonTranscript(
  sessionId: string,
  transcript: string
): Promise<AttachTranscriptResult> {
  const { accountId } = await requireSession();
  const text = (transcript ?? "").trim();
  if (text.length < 50) {
    return {
      ok: false,
      error: "The recording was too short to make notes from.",
    };
  }

  const [row] = await db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      type: sessions.type,
    })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
    .limit(1);
  if (!row) return { ok: false, error: "Session not found." };

  // Persist the verbatim transcript FIRST, before the fallible Claude step —
  // so nothing recorded is lost even if summarization errors out.
  await db
    .update(sessions)
    .set({ transcript: text, updatedAt: new Date() })
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.accountId, accountId), eq(clients.id, row.clientId)))
    .limit(1);

  let generated: { notes: string; tldr: string };
  try {
    generated = await generateNotesFromTranscript({
      transcript: text,
      clientFirstName:
        client?.fullName.split(" ")[0] ?? client?.fullName ?? null,
      clientWorkingOn: client?.workingOn ?? null,
      sessionType: row.type,
    });
  } catch (err) {
    // The transcript is already saved — she can retry the summary.
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Transcript saved, but structuring the notes failed: ${err.message}. Try again.`
          : "Transcript saved, but structuring the notes failed. Try again.",
    };
  }

  await db
    .update(sessions)
    .set({
      transcript: text,
      aiSummary: generated.notes,
      aiSummaryTldr: generated.tldr || null,
      // Reuse the "transcript attached" marker the panel/chip keys off. There's
      // no Recall bot for in-person, so there's no pipeline to race with.
      recallTranscriptReceivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));

  revalidatePath(`/clients/${row.clientId}`);
  return { ok: true, summaryChars: generated.notes.length };
}
