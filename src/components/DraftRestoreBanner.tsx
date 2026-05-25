"use client";

// Tiny banner that appears at the top of a form when a draft is sitting in
// localStorage waiting to be restored. Two buttons: Restore (pulls the stored
// value into the form) and Discard (deletes the stored value).
//
// Designed to be quiet and reassuring, not anxiety-inducing. The copy
// emphasizes "your typing is safe" rather than "we caught you losing data."

import { formatAge } from "@/lib/useDraft";

export function DraftRestoreBanner({
  ageMs,
  onRestore,
  onDiscard,
}: {
  ageMs: number | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="text-xs rounded-md p-2.5 flex items-center gap-3 flex-wrap"
      style={{
        background: "var(--color-plum-50)",
        border: "1px solid var(--color-plum-100)",
        color: "var(--color-plum-700)",
      }}
    >
      <svg
        className="w-3.5 h-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="flex-1 min-w-0">
        Unsaved typing from {formatAge(ageMs)} — restore it?
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onRestore}
          className="font-medium underline hover:no-underline"
        >
          Restore
        </button>
        <span className="text-plum-300">·</span>
        <button
          type="button"
          onClick={onDiscard}
          className="text-plum-500 hover:text-plum-700"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/** Small "All changes saved" / "Saving..." indicator that sits inline near
 *  a save button. Quiet and unobtrusive. */
export function SaveStatusChip({
  status,
}: {
  status: "idle" | "saving" | "saved";
}) {
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <span className="text-[10px] text-ink-400 italic">Saving draft…</span>
    );
  }
  return (
    <span className="text-[10px] text-ink-400 inline-flex items-center gap-1">
      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      Draft saved
    </span>
  );
}
