"use client";

// "From audio" — the voice-memo → Whisper → AI-notes pipeline.
//
// Two input modes (tabs):
//   1. Record — uses MediaRecorder to capture a voice memo right in the
//      browser. Magical on phone: she taps once and starts talking on the
//      drive home. Works on iOS Safari 14.3+.
//   2. Upload — file picker (drag-drop + click). Accepts any audio file
//      under 25 MB (Whisper's hard ceiling).
//
// Once she has audio, "Transcribe → Notes" runs a three-hop pipeline with
// a progress line for each step:
//
//      Uploading…  →  Transcribing…  →  Structuring notes…  →  Done.
//
// Hop 1: `uploadVoiceMemo` server action → file lands on Vercel Blob as
//        an attachment with kind="recording" linked to the session, and
//        we get the public URL back.
// Hop 2: POST /api/transcribe with that URL → Whisper returns the
//        transcript (with language + duration metadata).
// Hop 3: `generateNotesForSession` server action with the transcript →
//        Claude turns it into structured notes; the session's notes
//        field is updated; the page revalidates.
//
// On error at any hop, we surface the message and let her retry from
// where she was (audio still in memory, no re-record needed).

import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { uploadVoiceMemo } from "@/lib/uploads";
import { generateNotesForSession } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import type { NoteTemplate } from "@/db/schema";
import { notify } from "./FlashNotifier";

type Mode = "record" | "upload";

type Stage =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "captured" }
  | { kind: "uploading" }
  | { kind: "transcribing" }
  | { kind: "generating" }
  | { kind: "done"; charsInserted: number }
  | { kind: "error"; message: string; previousStage?: Stage["kind"] };

const MAX_BYTES = 25 * 1024 * 1024;

export function GenerateNotesFromAudioDialog({
  sessionId,
  noteTemplates,
  hasExistingNotes,
  defaultLanguage,
  autoClose = false,
}: {
  sessionId: string;
  noteTemplates: NoteTemplate[];
  hasExistingNotes: boolean;
  /** Language hint passed to Whisper. Picks up from the client's
   *  preferredLanguage; null = auto-detect. */
  defaultLanguage?: "en" | "ru" | "uk" | null;
  /** When true, dialog closes automatically after a successful run.
   *  Same toggle the existing paste-dialog respects. */
  autoClose?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("record");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>(
    noteTemplates[0]?.id ?? ""
  );
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [language, setLanguage] = useState<"" | "en" | "ru" | "uk">(
    defaultLanguage ?? ""
  );

  // MediaRecorder bookkeeping
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Tick the elapsed counter while recording — separate from stage so we
  // re-render once a second instead of on every datavailable event.
  useEffect(() => {
    if (stage.kind !== "recording") return;
    const start = stage.startedAt;
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [stage]);

  // Reset internal state when the dialog closes. Important: revoke the
  // ObjectURL we made for the audio preview so we don't leak memory.
  useEffect(() => {
    if (open) return;
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    setAudioFile(null);
    setStage({ kind: "idle" });
    setElapsed(0);
    chunksRef.current = [];
    // Stop any live stream (e.g. mic still on if she closes mid-record)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    mediaRecorderRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function setCapturedFile(file: File) {
    if (file.size > MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setStage({
        kind: "error",
        message: `That file is ${mb} MB. The limit is 25 MB — Whisper rejects anything larger.`,
      });
      return;
    }
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioFile(file);
    setAudioPreviewUrl(URL.createObjectURL(file));
    setStage({ kind: "captured" });
  }

  async function startRecording() {
    setStage({ kind: "idle" });
    chunksRef.current = [];
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    setAudioFile(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setStage({
        kind: "error",
        message:
          "Your browser doesn't support recording. Use Upload instead, or try a recent Safari / Chrome.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Pick the best mime type the browser supports. webm/opus is most
      // common; iOS Safari falls back to mp4/aac. Both are fine for Whisper.
      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const actualType = recorder.mimeType || "audio/webm";
        const ext = extensionForMime(actualType);
        const blob = new Blob(chunksRef.current, { type: actualType });
        const file = new File([blob], `memo-${Date.now()}.${ext}`, {
          type: actualType,
        });
        // Release the mic immediately — the recording indicator going
        // away is the user's signal it's no longer listening.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        setCapturedFile(file);
      };
      recorder.start();
      setStage({ kind: "recording", startedAt: Date.now() });
      setElapsed(0);
    } catch (err) {
      setStage({
        kind: "error",
        message:
          err instanceof Error && err.name === "NotAllowedError"
            ? "Microphone permission denied. Allow it in your browser settings and try again."
            : err instanceof Error
              ? err.message
              : "Couldn't start recording.",
      });
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current) return;
    try {
      mediaRecorderRef.current.stop();
    } catch (err) {
      console.error("[record] stop failed:", err);
    }
  }

  async function runPipeline() {
    if (!audioFile) return;

    // Hop 1 — upload to Blob via the server action.
    setStage({ kind: "uploading" });
    let audioUrl: string;
    try {
      const fd = new FormData();
      fd.append("sessionId", sessionId);
      fd.append("file", audioFile);
      const result = await uploadVoiceMemo(fd);
      if (!result.ok) {
        setStage({ kind: "error", message: result.error });
        return;
      }
      audioUrl = result.audioUrl;
    } catch (err) {
      rethrowIfRedirect(err);
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
      return;
    }

    // Hop 2 — POST /api/transcribe with the Blob URL.
    setStage({ kind: "transcribing" });
    let transcript: string;
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl,
          language: language || undefined,
          filename: audioFile.name,
        }),
      });
      const body = (await res.json()) as
        | { transcript: string; language: string | null; durationSeconds: number | null }
        | { error: string };
      if (!res.ok || "error" in body) {
        setStage({
          kind: "error",
          message: "error" in body ? body.error : `HTTP ${res.status}`,
        });
        return;
      }
      transcript = body.transcript;
    } catch (err) {
      setStage({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Transcription request failed",
      });
      return;
    }

    if (transcript.trim().length < 50) {
      setStage({
        kind: "error",
        message:
          "The transcript is too short to structure into notes. Was the memo silent or very brief?",
      });
      return;
    }

    // Hop 3 — Claude structures the transcript into session notes.
    setStage({ kind: "generating" });
    try {
      const fd = new FormData();
      fd.append("sessionId", sessionId);
      fd.append("transcript", transcript);
      if (templateId) fd.append("templateId", templateId);
      if (replaceExisting) fd.append("replaceExisting", "true");
      const result = await generateNotesForSession(fd);
      if (!result.ok) {
        setStage({ kind: "error", message: result.error });
        return;
      }
      setStage({ kind: "done", charsInserted: result.notes?.length ?? 0 });
      notify({
        kind: "success",
        title: "Notes from audio",
        body: "Transcribed and structured into the session.",
        ttlMs: 3500,
      });
      if (autoClose) {
        window.setTimeout(() => setOpen(false), 1200);
      }
    } catch (err) {
      rethrowIfRedirect(err);
      setStage({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Notes generation failed",
      });
    }
  }

  const recording = stage.kind === "recording";
  const inFlight =
    stage.kind === "uploading" ||
    stage.kind === "transcribing" ||
    stage.kind === "generating";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-plum-700 hover:underline font-medium inline-flex items-center gap-1"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 11a7 7 0 01-14 0m7 7v3m-4 0h8M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z"
          />
        </svg>
        From audio
      </button>
      <Modal
        open={open}
        onClose={() => {
          if (inFlight) return; // can't close mid-pipeline
          setOpen(false);
        }}
        locked={inFlight || recording}
        title="Voice memo → notes"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={inFlight || recording}
              className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md disabled:opacity-50"
            >
              Cancel
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={runPipeline}
              disabled={
                !audioFile ||
                stage.kind !== "captured" ||
                inFlight
              }
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-50"
            >
              Transcribe → Notes
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-500 leading-relaxed">
            Record a memo on your phone (or upload an audio file). It gets
            transcribed by Whisper and structured into session notes by
            Claude. The audio is saved as a recording attachment on this
            session.
          </p>

          {/* Mode tabs — disabled mid-pipeline so she can't switch tabs
              and lose her capture state. */}
          <div className="flex gap-1 border-b border-ink-200">
            {(["record", "upload"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (recording || inFlight) return;
                  setMode(m);
                  setStage({ kind: "idle" });
                  setAudioFile(null);
                  if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
                  setAudioPreviewUrl(null);
                }}
                disabled={recording || inFlight}
                className={`px-3 py-1.5 text-xs font-medium -mb-px border-b-2 transition ${
                  mode === m
                    ? "border-plum-500 text-plum-700"
                    : "border-transparent text-ink-500 hover:text-ink-900"
                } disabled:opacity-50`}
              >
                {m === "record" ? "Record" : "Upload"}
              </button>
            ))}
          </div>

          {mode === "record" ? (
            <RecordPanel
              recording={recording}
              elapsed={elapsed}
              onStart={startRecording}
              onStop={stopRecording}
              audioPreviewUrl={
                stage.kind === "captured" ||
                stage.kind === "uploading" ||
                stage.kind === "transcribing" ||
                stage.kind === "generating" ||
                stage.kind === "done"
                  ? audioPreviewUrl
                  : null
              }
              audioMime={audioFile?.type ?? null}
              disabled={inFlight}
            />
          ) : (
            <UploadPanel
              onFile={setCapturedFile}
              file={audioFile}
              audioPreviewUrl={audioPreviewUrl}
              disabled={inFlight}
            />
          )}

          {/* Settings: notes template + language hint + replace mode */}
          <div className="grid grid-cols-2 gap-3">
            {noteTemplates.length > 0 && (
              <Field label="Notes template" hint="Drives the headings used.">
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={inFlight}
                  className={inputCls}
                >
                  <option value="">No template (Claude picks structure)</option>
                  {noteTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              label="Language"
              hint="Hint for Whisper. Auto-detects if blank."
            >
              <select
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value as "" | "en" | "ru" | "uk")
                }
                disabled={inFlight}
                className={inputCls}
              >
                <option value="">Auto-detect</option>
                <option value="en">English</option>
                <option value="ru">Русский</option>
                <option value="uk">Українська</option>
              </select>
            </Field>
          </div>

          {hasExistingNotes && (
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                disabled={inFlight}
                className="rounded"
              />
              Replace existing notes (otherwise the new ones append).
            </label>
          )}

          {/* Pipeline progress — three lines, one per hop */}
          <PipelineProgress stage={stage} />

          {stage.kind === "error" && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {stage.message}
            </div>
          )}

          {stage.kind === "done" && (
            <div className="text-xs text-sage-700 bg-sage-50 border border-sage-100 rounded p-2">
              Done. {stage.charsInserted} characters inserted — scroll to
              the session notes to review.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function RecordPanel({
  recording,
  elapsed,
  onStart,
  onStop,
  audioPreviewUrl,
  audioMime,
  disabled,
}: {
  recording: boolean;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  audioPreviewUrl: string | null;
  audioMime: string | null;
  disabled: boolean;
}) {
  return (
    <div className="paper-card p-5 text-center">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={recording ? onStop : onStart}
          disabled={disabled}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition disabled:opacity-50 ${
            recording
              ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
              : "bg-plum-500 hover:bg-plum-600 text-white"
          }`}
        >
          {recording ? (
            <span className="block w-5 h-5 bg-white rounded-sm" />
          ) : (
            <svg
              className="w-7 h-7"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>
        <div className="text-sm text-ink-700 font-mono">
          {formatElapsed(elapsed)}
        </div>
        <div className="text-[11px] text-ink-500">
          {recording ? (
            <>Listening — tap to stop.</>
          ) : audioPreviewUrl ? (
            <>Recorded. Tap the mic again to redo.</>
          ) : (
            <>Tap to record. You can talk for up to ~30 minutes.</>
          )}
        </div>
      </div>
      {audioPreviewUrl && !recording && (
        <audio
          src={audioPreviewUrl}
          controls
          className="w-full mt-4"
          {...(audioMime ? { "data-mime": audioMime } : {})}
        />
      )}
    </div>
  );
}

function UploadPanel({
  onFile,
  file,
  audioPreviewUrl,
  disabled,
}: {
  onFile: (file: File) => void;
  file: File | null;
  audioPreviewUrl: string | null;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="paper-card p-5">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith("audio/")) onFile(f);
        }}
        className={`block border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition ${
          dragOver
            ? "border-plum-500 bg-plum-50"
            : "border-ink-200 hover:border-ink-300"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <div className="text-sm text-ink-700 font-medium mb-1">
          {file ? file.name : "Drop an audio file or tap to choose."}
        </div>
        <div className="text-[11px] text-ink-500">
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ${
                file.type || "audio file"
              }`
            : "mp3 · m4a · wav · webm · ogg · up to 25 MB"}
        </div>
      </label>
      {audioPreviewUrl && (
        <audio src={audioPreviewUrl} controls className="w-full mt-4" />
      )}
    </div>
  );
}

function PipelineProgress({ stage }: { stage: Stage }) {
  const items: { key: Stage["kind"]; label: string }[] = [
    { key: "uploading", label: "Uploading audio…" },
    { key: "transcribing", label: "Transcribing with Whisper…" },
    { key: "generating", label: "Structuring notes with Claude…" },
  ];
  const order: Stage["kind"][] = [
    "idle",
    "recording",
    "captured",
    "uploading",
    "transcribing",
    "generating",
    "done",
    "error",
  ];
  const currentIdx = order.indexOf(stage.kind);
  const isAfter = (key: Stage["kind"]) =>
    currentIdx > order.indexOf(key) && stage.kind !== "error";
  const isCurrent = (key: Stage["kind"]) => stage.kind === key;

  if (
    stage.kind === "idle" ||
    stage.kind === "recording" ||
    stage.kind === "captured"
  ) {
    return null;
  }

  return (
    <ul className="space-y-1.5 text-xs text-ink-600 border-l-2 border-ink-100 pl-3">
      {items.map((it) => (
        <li
          key={it.key}
          className={`flex items-center gap-2 ${
            isCurrent(it.key)
              ? "text-plum-700 font-medium"
              : isAfter(it.key)
                ? "text-sage-700"
                : "text-ink-400"
          }`}
        >
          {isAfter(it.key) ? (
            <span aria-hidden="true">✓</span>
          ) : isCurrent(it.key) ? (
            <span className="inline-block w-2 h-2 rounded-full bg-plum-500 animate-pulse" />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full border border-ink-300" />
          )}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Pick the best mime type the current MediaRecorder supports. Order matters:
// webm/opus → mp4 → ogg → undefined (let the browser default). All of these
// are acceptable to Whisper.
function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

function extensionForMime(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/wav")) return "wav";
  if (mime.startsWith("audio/mpeg")) return "mp3";
  return "webm";
}
