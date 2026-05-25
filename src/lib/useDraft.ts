"use client";

// Draft autosave + restore for long-form inputs.
//
// Why this exists: Svitlana writes session notes that can run 600+ chars,
// pastes transcripts that can be 5,000+ chars, and edits intake notes that
// matter emotionally. A browser crash, a misclick, an accidental tab close,
// a "are you sure you want to leave" she clicks wrong — and the work is gone.
// This hook quietly mirrors every input she makes into localStorage. If she
// returns to the same form, we offer to restore it.
//
// Design:
// - Storage = localStorage (survives browser restart, not just tab close).
// - Writes are debounced (500ms idle) so we don't hammer disk on every keystroke.
// - Drafts auto-expire after 30 days so localStorage doesn't grow forever.
// - On successful save, the caller calls `clearDraft()` to remove the stash.
// - Each form picks its own key shape: `draft:session:<id>:notes`,
//   `draft:client:<id>:edit`, `draft:new-client`, etc. The hook doesn't care.
//
// Stored shape: { value, savedAt }. `value` is whatever the caller passed
// — a string for single-field forms, an object for whole-form snapshots.

import { useEffect, useRef, useState, useCallback } from "react";

const PREFIX = "ss.draft.";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type StoredDraft<T> = {
  value: T;
  savedAt: number;
};

export type DraftStatus = "idle" | "saving" | "saved";

export function useDraft<T>(
  /** Unique key identifying this draft. Falsy → autosave is disabled
   *  (e.g. modal closed, no session id yet). */
  key: string | null | undefined,
  /** Initial value to use when there's no stored draft to restore. */
  initialValue: T
) {
  const storageKey = key ? `${PREFIX}${key}` : null;

  // Whether the stored draft (if any) is older than 30 days — if so we
  // treat it as nonexistent and let it get overwritten.
  const storedDraftRef = useRef<StoredDraft<T> | null>(null);

  // Read what's in localStorage exactly once on mount. We don't want to read
  // it again later; the caller's `value` is the source of truth from then on.
  const [hasStoredDraft, setHasStoredDraft] = useState(false);
  const [storedAgeMs, setStoredAgeMs] = useState<number | null>(null);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // On mount (or key change), check storage for an existing draft.
  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) {
      setHasStoredDraft(false);
      setStoredAgeMs(null);
      storedDraftRef.current = null;
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setHasStoredDraft(false);
        return;
      }
      const parsed = JSON.parse(raw) as StoredDraft<T>;
      const age = Date.now() - (parsed.savedAt ?? 0);
      if (age > MAX_AGE_MS) {
        // Stale — quietly clean it up.
        window.localStorage.removeItem(storageKey);
        setHasStoredDraft(false);
        return;
      }
      storedDraftRef.current = parsed;
      setHasStoredDraft(true);
      setStoredAgeMs(age);
    } catch {
      // Corrupt / unparseable — drop it.
      try {
        window.localStorage.removeItem(storageKey);
      } catch {}
      setHasStoredDraft(false);
    }
  }, [storageKey]);

  // Debounced writer. The caller calls `saveDraft(value)` on every change;
  // we coalesce the bursts and write once they go idle for 500ms.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrittenRef = useRef<string | null>(null);

  const saveDraft = useCallback(
    (value: T) => {
      if (typeof window === "undefined" || !storageKey) return;
      setStatus("saving");
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        try {
          const serialized = JSON.stringify({
            value,
            savedAt: Date.now(),
          } satisfies StoredDraft<T>);
          // Skip the write if the serialized value is identical to last time —
          // avoids burning disk for trivial cursor moves that re-trigger onChange.
          if (serialized === lastWrittenRef.current) {
            setStatus("saved");
            return;
          }
          window.localStorage.setItem(storageKey, serialized);
          lastWrittenRef.current = serialized;
          setLastSavedAt(Date.now());
          setStatus("saved");
        } catch (e) {
          // QuotaExceededError, private browsing, etc. — silent fail; the
          // form still works, just no autosave. Don't surface this to her.
          console.warn("[useDraft] couldn't persist:", e);
          setStatus("idle");
        }
      }, 500);
    },
    [storageKey]
  );

  // Explicit clear — call this from the caller's save-success path.
  const clearDraft = useCallback(() => {
    if (typeof window === "undefined" || !storageKey) return;
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    try {
      window.localStorage.removeItem(storageKey);
    } catch {}
    lastWrittenRef.current = null;
    setHasStoredDraft(false);
    setStoredAgeMs(null);
    setStatus("idle");
  }, [storageKey]);

  // Pull the stored value for the caller's "Restore" button.
  const readStoredValue = useCallback((): T | null => {
    return storedDraftRef.current?.value ?? null;
  }, []);

  // "I'm not going to restore this" — clears storage without otherwise touching state.
  const discardStored = useCallback(() => {
    clearDraft();
    setHasStoredDraft(false);
  }, [clearDraft]);

  // Initial value: caller-provided. If they want to use the stored draft
  // they call `readStoredValue()` and pass it back through `setValue` on
  // their own state.
  return {
    /** Save the current value as a draft. Debounced. Safe to call on every keystroke. */
    saveDraft,
    /** Remove the stored draft (call on successful save). */
    clearDraft,
    /** Discard a restorable stored draft without restoring. */
    discardStored,
    /** Read what's currently in storage — for the "Restore" button. */
    readStoredValue,
    /** True iff a non-stale draft is in storage right now. */
    hasStoredDraft,
    /** Age of the stored draft in ms (for "saved 3 min ago" text). */
    storedAgeMs,
    /** "idle" | "saving" | "saved" — for a discreet indicator near the form. */
    status,
    /** Unix ms of the last successful autosave write. */
    lastSavedAt,
    /** Initial value to use if no draft is being restored. */
    initialValue,
  };
}

/** Helper — "saved 3 min ago" style text from an age in ms. */
export function formatAge(ms: number | null): string {
  if (ms == null) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
