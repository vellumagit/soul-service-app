"use client";

// In-person session recorder.
//
// Records the session live in the room, then runs the SAME pipeline as the
// remote notetaker: audio → Whisper transcript → Claude summary, landing in
// the session's "From the meeting" panel (transcript / summary / at-a-glance).
//
// Reliability choices (in-person sessions are ~60 min of irreplaceable audio):
//   - CONSENT gate — Start is disabled until she confirms the client agreed.
//   - MONO + low-bitrate capture (~24 kbps) so a full hour fits comfortably
//     under Whisper's 25 MB single-file limit.
//   - WAKE LOCK — keeps the screen awake so the phone/tablet doesn't sleep and
//     kill the mic mid-session (re-acquired if the tab is backgrounded then
//     refocused).
//   - LEAVE GUARD — a beforeunload prompt while recording, so an accidental
//     back-swipe or tab close doesn't silently discard the recording.
//   - The audio is uploaded to the session as a recording attachment before
//     transcription, so even if Whisper/Claude fail she still has the file.

import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { uploadVoiceMemo } from "@/lib/uploads";
import { attachInPersonTranscript } from "@/lib/in-person-recording";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";

type Stage =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "captured" }
  | { kind: "uploading" }
  | { kind: "transcribing" }
  | { kind: "generating" }
  | { kind: "done"; chars: number }
  | { kind: "error"; message: string };

const MAX_BYTES = 25 * 1024 * 1024;
const SOFT_LIMIT_SECONDS = 90 * 60; // gentle "wrap up" nudge past 90 min

export function RecordSessionDialog({
  sessionId,
  hasExistingNotes,
  defaultLanguage,
  trigger,
}: {
  sessionId: string;
  hasExistingNotes: boolean;
  defaultLanguage?: "en" | "ru" | "uk" | null;
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [consented, setConsented] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [language, setLanguage] = useState<"" | "en" | "ru" | "uk">(
    defaultLanguage ?? ""
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const recording = stage.kind === "recording";
  const inFlight =
    stage.kind === "uploading" ||
    stage.kind === "transcribing" ||
    stage.kind === "generating";

  // Elapsed timer while recording.
  useEffect(() => {
    if (stage.kind !== "recording") return;
    const start = stage.startedAt;
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [stage]);

  // Leave-guard: warn on accidental navigation/close while recording or mid-
  // pipeline (before the audio is safely uploaded).
  useEffect(() => {
    if (!recording && !inFlight) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [recording, inFlight]);

  // Re-acquire the wake lock if the tab was backgrounded then refocused —
  // browsers auto-release it on visibility change.
  useEffect(() => {
    if (!recording) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, [recording]);

  // Full teardown when the dialog closes.
  useEffect(() => {
    if (open) return;
    teardownStream();
    releaseWakeLock();
    setStage({ kind: "idle" });
    setConsented(false);
    setAudioFile(null);
    setElapsed(0);
    chunksRef.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function acquireWakeLock() {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener?.("release", () => {
          wakeLockRef.current = null;
        });
      }
    } catch {
      // Wake Lock unsupported or denied — recording still works; she just
      // needs to keep the screen on herself.
    }
  }
  function releaseWakeLock() {
    try {
      void wakeLockRef.current?.release();
    } catch {
      /* noop */
    }
    wakeLockRef.current = null;
  }
  function teardownStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    mediaRecorderRef.current = null;
  }

  async function startRecording() {
    if (!consented) return;
    setStage({ kind: "idle" });
    chunksRef.current = [];
    setAudioFile(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setStage({
        kind: "error",
        message:
          "This browser can't record. Use a recent Safari or Chrome, ideally on a laptop or tablet.",
      });
      return;
    }

    try {
      // Mono + noise handling → smaller, cleaner audio for a room.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 24000, // ~180 KB/min → ~1 hr well under 25 MB
      });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const actualType = recorder.mimeType || "audio/webm";
        const ext = extensionForMime(actualType);
        const blob = new Blob(chunksRef.current, { type: actualType });
        const file = new File([blob], `session-${Date.now()}.${ext}`, {
          type: actualType,
        });
        teardownStream();
        releaseWakeLock();
        if (file.size > MAX_BYTES) {
          const mb = (file.size / 1024 / 1024).toFixed(0);
          setStage({
            kind: "error",
            message: `That recording is ${mb} MB — over Whisper's 25 MB limit. It was saved to the session as an audio file; for notes, split it or re-record shorter segments.`,
          });
          // Still upload so the audio isn't lost.
          void uploadOnly(file);
          return;
        }
        setAudioFile(file);
        setStage({ kind: "captured" });
      };
      // Emit a chunk every 10s so a crash mid-session loses at most ~10s, not
      // the whole recording (chunks accumulate in chunksRef).
      recorder.start(10_000);
      await acquireWakeLock();
      setStage({ kind: "recording", startedAt: Date.now() });
      setElapsed(0);
    } catch (err) {
      setStage({
        kind: "error",
        message:
          err instanceof Error && err.name === "NotAllowedError"
            ? "Microphone permission was denied. Allow it in your browser settings and try again."
            : err instanceof Error
              ? err.message
              : "Couldn't start recording.",
      });
    }
  }

  function stopRecording() {
    try {
      mediaRecorderRef.current?.stop();
    } catch (err) {
      console.error("[record-session] stop failed:", err);
    }
  }

  // Best-effort: save the audio attachment even when it's too big to transcribe.
  async function uploadOnly(file: File) {
    try {
      const fd = new FormData();
      fd.append("sessionId", sessionId);
      fd.append("file", file);
      await uploadVoiceMemo(fd);
    } catch {
      /* already surfaced the size error */
    }
  }

  async function runPipeline() {
    if (!audioFile) return;

    // Hop 1 — upload the audio to the session.
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

    // Hop 2 — Whisper transcription.
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
        | { transcript: string }
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

    // Hop 3 — Claude structures it into the notetaker fields.
    setStage({ kind: "generating" });
    try {
      const result = await attachInPersonTranscript(sessionId, transcript);
      if (!result.ok) {
        setStage({ kind: "error", message: result.error });
        return;
      }
      setStage({ kind: "done", chars: result.summaryChars });
      notify({
        kind: "success",
        title: "Session recorded",
        body: "Transcribed and summarized into “From the meeting.”",
        ttlMs: 4000,
      });
    } catch (err) {
      rethrowIfRedirect(err);
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Notes generation failed",
      });
    }
  }

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-plum-600 hover:bg-plum-700 px-2.5 py-1.5 rounded-md"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          Record session
        </button>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (recording || inFlight) return; // don't drop a live recording
          setOpen(false);
        }}
        locked={recording || inFlight}
        title="Record this in-person session"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={recording || inFlight}
              className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md disabled:opacity-50"
            >
              {stage.kind === "done" ? "Close" : "Cancel"}
            </button>
            <div className="flex-1" />
            {stage.kind === "captured" && (
              <button
                type="button"
                onClick={runPipeline}
                className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium"
              >
                Transcribe → Notes
              </button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-500 leading-relaxed">
            Records the session on this device, then transcribes it (Whisper)
            and summarizes it (Claude) into this session&apos;s “From the
            meeting” panel — the same place your online sessions land. The
            audio is also saved to the session.
          </p>

          {/* Consent gate */}
          <label className="flex items-start gap-2 text-xs text-ink-700 bg-honey-50 border border-honey-100 rounded-md p-3">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              disabled={recording || inFlight || stage.kind === "captured"}
              className="mt-0.5 rounded"
            />
            <span>
              My client has agreed to be recorded for this session.
            </span>
          </label>

          {/* Recorder */}
          <div className="paper-card p-5 text-center">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={
                  inFlight ||
                  stage.kind === "captured" ||
                  stage.kind === "done" ||
                  (!recording && !consented)
                }
                aria-label={recording ? "Stop recording" : "Start recording"}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition disabled:opacity-40 ${
                  recording
                    ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                    : "bg-plum-500 hover:bg-plum-600 text-white"
                }`}
              >
                {recording ? (
                  <span className="block w-5 h-5 bg-white rounded-sm" />
                ) : (
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                )}
              </button>
              <div className="text-sm text-ink-700 font-mono">
                {formatElapsed(elapsed)}
              </div>
              <div className="text-[11px] text-ink-500 max-w-xs">
                {recording ? (
                  <>
                    Recording — keep this screen open and the app in front.
                    {elapsed > SOFT_LIMIT_SECONDS && (
                      <span className="block text-honey-700 mt-1">
                        Over 90 minutes — consider stopping soon so the file
                        stays under the transcription limit.
                      </span>
                    )}
                  </>
                ) : stage.kind === "captured" ? (
                  <>Recorded. Tap “Transcribe → Notes,” or the mic to redo.</>
                ) : !consented ? (
                  <>Confirm consent above, then tap to start.</>
                ) : (
                  <>Tap to start recording.</>
                )}
              </div>
            </div>
          </div>

          <Field label="Language" hint="Hint for transcription. Auto-detects if blank.">
            <select
              value={language}
              onChange={(e) =>
                setLanguage(e.target.value as "" | "en" | "ru" | "uk")
              }
              disabled={recording || inFlight}
              className={inputCls}
            >
              <option value="">Auto-detect</option>
              <option value="en">English</option>
              <option value="ru">Русский</option>
              <option value="uk">Українська</option>
            </select>
          </Field>

          {hasExistingNotes && (
            <p className="text-[11px] text-ink-400">
              This won&apos;t touch your own written notes — the transcript and
              summary land in the separate “From the meeting” panel.
            </p>
          )}

          <PipelineProgress stage={stage} />

          {stage.kind === "error" && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {stage.message}
            </div>
          )}
          {stage.kind === "done" && (
            <div className="text-xs text-sage-700 bg-sage-50 border border-sage-100 rounded p-2">
              Done — {stage.chars} characters of summary. Scroll to “From the
              meeting” on the session to review.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function PipelineProgress({ stage }: { stage: Stage }) {
  const items: { key: Stage["kind"]; label: string }[] = [
    { key: "uploading", label: "Saving the recording…" },
    { key: "transcribing", label: "Transcribing with Whisper…" },
    { key: "generating", label: "Summarizing with Claude…" },
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

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

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
  return "webm";
}
