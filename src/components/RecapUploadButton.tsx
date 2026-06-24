"use client";

// Upload UI for a session recap. Pattern:
//   1. User picks file → POST to server action to mint a one-time URL.
//   2. Browser POSTs the file directly to Cloudflare (xhr so we get
//      progress events).
//   3. On 2xx, call confirmRecapUpload server action.
//
// Direct upload sidesteps the Vercel 4.5MB function payload limit. The
// upload happens entirely between browser and Cloudflare's edge.

import { useRef, useState } from "react";
import {
  createRecapUpload,
  confirmRecapUpload,
  removeRecapVideo,
} from "@/lib/session-recap-actions";

interface Props {
  sessionId: string;
  hasExisting: boolean;
  /** Called after upload completes; parent should router.refresh() */
  onChange?: () => void;
}

type Phase =
  | "idle"
  | "minting"
  | "uploading"
  | "confirming"
  | "done"
  | "removing"
  | "error";

export function RecapUploadButton({ sessionId, hasExisting, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhase("idle");
    setProgress(0);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handlePick(file: File) {
    setError(null);
    setPhase("minting");
    const mint = await createRecapUpload(sessionId);
    if (!mint.ok) {
      setError(mint.error);
      setPhase("error");
      return;
    }

    setPhase("uploading");
    try {
      await uploadDirect(mint.uploadURL, file, setProgress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setPhase("error");
      return;
    }

    setPhase("confirming");
    const confirm = await confirmRecapUpload(sessionId);
    if (!confirm.ok) {
      setError(confirm.error);
      setPhase("error");
      return;
    }
    setPhase("done");
    onChange?.();
    // Reset after a beat so the success state shows briefly.
    setTimeout(reset, 1500);
  }

  async function handleRemove() {
    if (!confirm("Remove the recap video? It will be deleted from Cloudflare too.")) {
      return;
    }
    setPhase("removing");
    setError(null);
    const r = await removeRecapVideo(sessionId);
    if (!r.ok) {
      setError(r.error);
      setPhase("error");
      return;
    }
    onChange?.();
    setPhase("idle");
  }

  const busy =
    phase === "minting" ||
    phase === "uploading" ||
    phase === "confirming" ||
    phase === "removing";

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handlePick(f);
        }}
      />
      {!hasExisting && phase === "idle" && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-2.5 py-1 text-[11px] bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium"
        >
          + Add recap video
        </button>
      )}
      {hasExisting && phase === "idle" && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-2.5 py-1 text-[11px] text-ink-600 hover:text-ink-900"
          >
            Replace video
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="px-2.5 py-1 text-[11px] text-ink-500 hover:text-rose-700"
          >
            Remove
          </button>
        </>
      )}
      {phase === "minting" && (
        <span className="text-[11px] text-ink-500 italic">Preparing…</span>
      )}
      {phase === "uploading" && (
        <span className="text-[11px] text-ink-500 italic">
          Uploading {progress}%
        </span>
      )}
      {phase === "confirming" && (
        <span className="text-[11px] text-ink-500 italic">Finishing…</span>
      )}
      {phase === "removing" && (
        <span className="text-[11px] text-ink-500 italic">Removing…</span>
      )}
      {phase === "done" && (
        <span className="text-[11px] text-sage-700 italic">Uploaded ✓</span>
      )}
      {phase === "error" && (
        <span className="text-[11px] text-rose-700 italic">
          {error}
          <button
            type="button"
            onClick={reset}
            className="ml-2 underline"
            disabled={busy}
          >
            try again
          </button>
        </span>
      )}
    </div>
  );
}

function uploadDirect(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new Error(
            `Cloudflare upload returned ${xhr.status}: ${xhr.responseText.slice(0, 200)}`
          )
        );
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
