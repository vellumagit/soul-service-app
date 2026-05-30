// Whisper transcription for voice memos.
//
// The practitioner records a memo on her phone (or uploads an audio file),
// it lands on Vercel Blob via the existing attachment pipeline, and this
// module pulls it back down and ships it to OpenAI Whisper for
// transcription. The resulting transcript then goes through the existing
// `generateNotesFromTranscript` Claude flow to become structured session
// notes.
//
// Why OpenAI here when the rest of the AI stack is Anthropic: Claude
// doesn't currently offer audio transcription, and Whisper is the
// industry-standard model for this. Audio is sent to OpenAI; per their
// API policy data is not retained for training (they keep ~30 days of
// logs for abuse detection).
//
// 25 MB is Whisper's hard file-size cap. We surface that to the UI as a
// friendly error rather than letting the API reject silently.

import OpenAI from "openai";

const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

// Lazy client — never throws at module load (build stays green even
// without the key). Same pattern as ai-notes.ts and help/route.ts.
let _client: OpenAI | null = null;
function getClient() {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local (and Vercel env vars for production). Get one at https://platform.openai.com"
    );
  }
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export type TranscribeInput = {
  /** Public Vercel Blob URL where the audio file is stored. */
  audioUrl: string;
  /** ISO 639-1 language hint to bias Whisper. Optional — auto-detects if omitted. */
  language?: "en" | "ru" | "uk" | null;
  /** Filename used in the multipart upload to Whisper. Affects the model's
   *  format inference; keep the original extension when possible. */
  filename?: string | null;
};

export type TranscribeResult = {
  transcript: string;
  /** Detected (or hint-confirmed) language code from Whisper's response. */
  language: string | null;
  /** Total audio duration in seconds, if Whisper reports it. */
  durationSeconds: number | null;
};

export async function transcribeAudioUrl(
  input: TranscribeInput
): Promise<TranscribeResult> {
  const { audioUrl, language, filename } = input;

  // Pull the audio bytes from Blob storage so we can hand a real File-like
  // object to the OpenAI SDK. Whisper accepts URLs only via the Hosted
  // API; the SDK's transcriptions endpoint wants a file upload.
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(
      `Couldn't fetch the audio from storage (HTTP ${audioRes.status}). ` +
        "Try uploading again."
    );
  }
  const audioBuffer = await audioRes.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    throw new Error("The uploaded file is empty.");
  }
  if (audioBuffer.byteLength > WHISPER_MAX_BYTES) {
    const mb = (audioBuffer.byteLength / 1024 / 1024).toFixed(1);
    throw new Error(
      `Audio is ${mb} MB — Whisper's limit is 25 MB. ` +
        "Trim the file or use a lower bitrate (a 1-hour session at 64 kbps is ~28 MB; 48 kbps is ~22 MB)."
    );
  }

  // Derive a sensible filename. Whisper uses the extension to pick the
  // decoder, so falling back to .webm (the most common MediaRecorder output)
  // is the safest default if the caller didn't pass one.
  const inferredName =
    filename ?? deriveNameFromUrl(audioUrl) ?? "memo.webm";

  // Use the SDK's File-like helper so we don't have to fuss with multipart
  // boundaries. The SDK accepts a File or Blob; we wrap our ArrayBuffer.
  const audioFile = new File([audioBuffer], inferredName, {
    type: contentTypeForName(inferredName),
  });

  const client = getClient();
  const response = await client.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    // verbose_json gives us language + duration in addition to the text.
    response_format: "verbose_json",
    language: language ?? undefined,
  });

  // OpenAI's TS types for verbose_json include language + duration; the SDK
  // surfaces them as optional fields.
  const transcript = (response.text ?? "").trim();
  if (transcript.length === 0) {
    throw new Error(
      "Whisper returned an empty transcript. Was the recording silent?"
    );
  }

  return {
    transcript,
    language:
      typeof (response as unknown as { language?: string }).language ===
      "string"
        ? ((response as unknown as { language?: string }).language ?? null)
        : null,
    durationSeconds:
      typeof (response as unknown as { duration?: number }).duration ===
      "number"
        ? ((response as unknown as { duration?: number }).duration ?? null)
        : null,
  };
}

function deriveNameFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split("/").filter(Boolean).pop();
    if (!last) return null;
    // Strip the timestamp prefix our uploads.ts pattern adds.
    const stripped = last.replace(/^\d+_/, "");
    return stripped.length > 0 ? stripped : null;
  } catch {
    return null;
  }
}

function contentTypeForName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "mp4":
    case "m4a":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}

export const VOICE_MEMO_LIMITS = {
  maxBytes: WHISPER_MAX_BYTES,
  maxMBLabel: "25 MB",
};
