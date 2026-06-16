// POST /api/transcribe
//
// Body: { audioUrl: string, language?: "en"|"ru"|"uk", filename?: string }
// Returns: { transcript, language, durationSeconds } on success
//          { error: string } on failure (with appropriate HTTP code)
//
// Account-scoped via requireSession — we don't transcribe for unauthenticated
// callers. The audioUrl is expected to be a Vercel Blob URL we wrote in a
// prior uploadVoiceMemo round-trip — but since the user controls the body,
// we MUST validate it before fetching server-side. Otherwise an
// authenticated user could POST audioUrl=http://169.254.169.254/... and
// have the server fetch instance-metadata on their behalf (classic SSRF).
// validatePublicWebhookUrl gives us literal-IP rejection (loopback,
// private, link-local / cloud-metadata, IPv6 ULA, IPv4-mapped IPv6).
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
  let accountId: string;
  try {
    ({ accountId } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Per-account rate limit. Whisper is paid per audio-minute; a runaway
  // script could rack up real cost. 10/min gives her ~one upload every
  // 6s (plenty for legit dictation flow) while bounding cost.
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rl = checkRateLimit("transcribe", accountId, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many transcription requests this minute." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
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

  // SSRF guard — see the file-level comment. Don't let an authenticated user
  // weaponize the server's fetch credentials against internal targets.
  const { validatePublicWebhookUrl } = await import("@/lib/url-safety");
  const v = validatePublicWebhookUrl(body.audioUrl);
  if (!v.ok) {
    return NextResponse.json(
      { error: `Invalid audio URL: ${v.error}` },
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
