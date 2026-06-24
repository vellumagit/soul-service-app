"use client";

// Upload UI for a product video. Same flow as RecapUploadButton:
//   1. POST to server action → returns Cloudflare direct-upload URL
//   2. Browser POSTs the file directly to Cloudflare
//   3. Server action confirms + backfills duration

import { useRef, useState } from "react";
import {
  createProductUpload,
  confirmProductUpload,
} from "@/lib/product-actions";

interface Props {
  productId: string;
  hasExisting: boolean;
  onChange?: () => void;
}

type Phase =
  | "idle"
  | "minting"
  | "uploading"
  | "confirming"
  | "done"
  | "error";

export function ProductVideoUploadButton({
  productId,
  hasExisting,
  onChange,
}: Props) {
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
    const mint = await createProductUpload(productId);
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
    const confirm = await confirmProductUpload(productId);
    if (!confirm.ok) {
      setError(confirm.error);
      setPhase("error");
      return;
    }
    setPhase("done");
    onChange?.();
    setTimeout(reset, 1500);
  }

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
      {phase === "idle" && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-3 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium"
        >
          {hasExisting ? "Replace video" : "+ Upload video"}
        </button>
      )}
      {phase === "minting" && (
        <span className="text-sm text-ink-500 italic">Preparing…</span>
      )}
      {phase === "uploading" && (
        <span className="text-sm text-ink-500 italic">
          Uploading {progress}%
        </span>
      )}
      {phase === "confirming" && (
        <span className="text-sm text-ink-500 italic">Finishing…</span>
      )}
      {phase === "done" && (
        <span className="text-sm text-sage-700 italic">Uploaded ✓</span>
      )}
      {phase === "error" && (
        <span className="text-sm text-rose-700 italic">
          {error}
          <button type="button" onClick={reset} className="ml-2 underline">
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
