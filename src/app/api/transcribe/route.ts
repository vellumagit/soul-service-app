// POST /api/transcribe
//
// Body: { audioUrl: string, language?: "en"|"ru"|"uk", filename?: string }
// Returns: { transcript, language, durationSeconds } on success
//          { error: string } on failure (with appropriate HTTP code)
//
// Account-scoped via requireSession — we don't transcribe for unauthenticated
// callers. The audioUrl must be a Vercel Blob URL we wrote earlier; we don't
// validate that explicitly because Whisper is happy to take any URL we can
// fetch, but the practical reality is the dialog calls uploadAttachment
// first and passes that URL.
//
// Why a route rather than a server action: server actions don't stream and
// the dialog wants to show "Transcribing…" progress while this runs. A
// fetch-based call to a route is easier to model in the client state
// machine. (We're not actually streaming Whisper's response — it's a single
// blocking call — but the round-trip-per-step pattern keeps the UX clean.)

import { NextResponse } from "next/server";
import { transcribeAudioUrl } from "@/lib/transcribe";
import { requireSession } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";
// Whisper for a long audio file can take up to ~60s; bump the function
// timeout above the default 10s so Vercel doesn't kill us mid-transcribe.
// (Hobby plan caps at 60s; Pro is 300s.)
export const maxDuration = 60;

type Body = {
  audioUrl?: unknown;
  language?: unknown;
  filename?: unknown;
};

function asLocaleHint(v: unknown): "en" | "ru" | "uk" | null {
  return v === "en" || v === "ru" || v === "uk" ? v : null;
}

export async function POST(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Couldn't parse the request body." },
      { status: 400 }
    );
  }

  if (typeof body.audioUrl !== "string" || body.audioUrl.length === 0) {
    return NextResponse.json(
      { error: "audioUrl is required." },
      { status: 400 }
    );
  }

  try {
    const result = await transcribeAudioUrl({
      audioUrl: body.audioUrl,
      language: asLocaleHint(body.language),
      filename: typeof body.filename === "string" ? body.filename : null,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Transcription failed.";
    // Whisper-level errors (file too large, empty, etc.) are mostly the
    // user's situation, not server bugs — surface them as 400.
    const status =
      err instanceof Error &&
      (err.message.includes("25 MB") ||
        err.message.includes("empty") ||
        err.message.includes("Couldn't fetch"))
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
