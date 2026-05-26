"use client";

// Practitioner-only space — hunches, observations, anything she'd want to
// remember but never share. Visually distinct (locked-feeling) so it's
// clear nothing here ever leaves the file.
//
// Inline-editable: click the body (or the empty-state text) to reveal a
// textarea. Autosaves to localStorage as she types, server-saves on
// "Save" or Cmd/Ctrl+Enter. Cancel reverts; the autosave draft is
// preserved separately so closing without saving still keeps a copy.

import { useEffect, useRef, useState } from "react";
import { MarkdownRender } from "./NotesEditor";
import { updateClientPrivateNotes } from "@/lib/actions";
import { useDraft } from "@/lib/useDraft";
import {
  DraftRestoreBanner,
  SaveStatusChip,
} from "./DraftRestoreBanner";
import { notify } from "./FlashNotifier";
import { describeSaveError } from "@/lib/save-error";

export function PrivateNotesBlock({
  clientId,
  body,
}: {
  clientId: string;
  body: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(body ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autosave the draft to localStorage. Inert when not editing.
  const draft = useDraft<string>(
    editing ? `client:${clientId}:privateNotes` : null,
    body ?? ""
  );
  const storedDraft = editing ? draft.readStoredValue() : null;
  const draftDiffers =
    storedDraft != null && storedDraft !== value && storedDraft !== (body ?? "");

  // When she enters edit mode, pre-fill from the server's current body. If a
  // draft is in storage and differs, the restore banner will offer it.
  useEffect(() => {
    if (editing) {
      setValue(body ?? "");
      // Focus + put cursor at the end so she can start typing immediately.
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (t) {
          t.focus();
          t.setSelectionRange(t.value.length, t.value.length);
        }
      });
    }
  }, [editing, body]);

  // When the prop changes (server revalidation after save), drop stale state.
  const lastBody = useRef(body ?? "");
  useEffect(() => {
    const next = body ?? "";
    if (next !== lastBody.current) {
      lastBody.current = next;
      if (!editing) setValue(next);
      draft.clearDraft();
    }
  }, [body, editing, draft]);

  function handleChange(v: string) {
    setValue(v);
    draft.saveDraft(v);
  }

  function restoreDraft() {
    const stored = draft.readStoredValue();
    if (stored != null) handleChange(stored);
    draft.discardStored();
  }

  async function save() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await updateClientPrivateNotes(clientId, value);
      if (!result.ok) {
        setError(result.error);
        notify({
          kind: "error",
          title: "Couldn't save private notes",
          body: result.error.slice(0, 200),
          ttlMs: 10000,
        });
      } else {
        draft.clearDraft();
        setEditing(false);
        notify({
          kind: "success",
          title: "Private notes saved",
          ttlMs: 2500,
        });
      }
    } catch (err) {
      const info = describeSaveError(err);
      setError(info.message);
      if (info.offline) {
        notify({
          kind: "warning",
          title: "You're offline",
          body: "Your typing is saved locally — try again once you're back online.",
          ttlMs: 10000,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    // Reset to server value but keep the localStorage draft around — if she
    // accidentally cancelled, the restore banner will offer it back on next
    // edit.
    setValue(body ?? "");
    setEditing(false);
    setError(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter saves — common pattern in notes editors.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  const hasBody = body && body.trim().length > 0;

  return (
    <div className="border border-ink-200 rounded-md bg-ink-900/[0.02] p-5">
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-3.5 h-3.5 text-ink-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
          Just for you
        </div>
        <div className="text-[10px] text-ink-400 hidden sm:block">
          · hunches, observations, things you&apos;re sitting with quietly
        </div>
        <div className="flex-1" />
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-plum-700 hover:underline"
          >
            {hasBody ? "Edit" : "Write something"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          {draftDiffers && (
            <DraftRestoreBanner
              ageMs={draft.storedAgeMs}
              onRestore={restoreDraft}
              onDiscard={() => draft.discardStored()}
            />
          )}
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={submitting}
            rows={6}
            placeholder="Hunches, observations, anything you're sitting with quietly. Nothing here is ever exported or shared."
            className="w-full px-3 py-2 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y"
          />
          <div className="flex items-center gap-2">
            <SaveStatusChip status={draft.status} />
            <span className="text-[10px] text-ink-400 hidden sm:inline">
              · <kbd className="kbd">⌘ Enter</kbd> to save, <kbd className="kbd">Esc</kbd> to cancel
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={cancel}
              disabled={submitting}
              className="text-xs text-ink-600 hover:text-ink-900 px-2 py-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={submitting}
              className="text-xs font-medium px-3 py-1.5 rounded bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : hasBody ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full text-left md-render text-sm text-ink-700 leading-relaxed cursor-text hover:bg-ink-50/40 -mx-2 px-2 py-1 rounded-md transition-colors"
          title="Click to edit"
        >
          <MarkdownRender body={body!} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full text-left text-sm text-ink-400 italic cursor-text hover:bg-ink-50/40 -mx-2 px-2 py-1 rounded-md transition-colors"
        >
          Nothing yet. Click to add something — hunches, observations, anything
          you&apos;re sitting with quietly. Stays here, never exported, never
          shared with the client.
        </button>
      )}
    </div>
  );
}
