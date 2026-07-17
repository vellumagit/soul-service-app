// Whisper transcription for session/voice-memo audio.
//
// The practitioner records (in-person or a voice memo), the audio lands on
// Vercel Blob via the existing attachment pipeline, and this module pulls it
// back down and ships it to Whisper for transcription. The resulting
// transcript then goes through the existing `generateNotesFromTranscript`
// Claude flow to become structured session notes.
//
// Provider: we default to GROQ (which hosts the same Whisper model,
// `whisper-large-v3-turbo`, ~9x cheaper and much faster than OpenAI's Whisper),
// and fall back to OpenAI (`whisper-1`) if only OPENAI_API_KEY is set. Groq's
// API is OpenAI-compatible, so the same SDK drives both — only the base URL +
// model differ. Claude doesn't offer audio transcription, which is why this one
// step lives outside the Anthropic stack.
//
// 25 MB is the safe single-file cap (OpenAI's hard limit and Groq's free-tier
// limit). We surface that to the UI as a friendly error rather than letting the
// API reject silently.

import OpenAI from "openai";

const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

type TranscribeProvider = { client: OpenAI; model: string };

// Lazy provider — never throws at module load (build stays green even without
// a key). Prefers Groq; falls back to OpenAI. Same lazy pattern as ai-notes.ts.
let _provider: TranscribeProvider | null = null;
function getProvider(): TranscribeProvider {
  if (_provider) return _provider;

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    _provider = {
      client: new OpenAI({ apiKey: groqKey, baseURL: GROQ_BASE_URL }),
      model: "whisper-large-v3-turbo",
    };
    return _provider;
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    _provider = { client: new OpenAI({ apiKey: openaiKey }), model: "whisper-1" };
    return _provider;
  }

  throw new Error(
    "No transcription key is set. Add GROQ_API_KEY (recommended — cheap Whisper via Groq, get one at https://console.groq.com) or OPENAI_API_KEY to your Vercel env vars."
  );
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

  const { client, model } = getProvider();
  const response = await client.audio.transcriptions.create({
    file: audioFile,
    model,
    // verbose_json gives us language + duration in addition to the text.
    // Supported by both OpenAI Whisper and Groq's whisper-large-v3-turbo.
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
