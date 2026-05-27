"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { createClient } from "@/lib/actions";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n";
import { isRedirectError } from "@/lib/redirect-error";
import { useDraft } from "@/lib/useDraft";
import {
  DraftRestoreBanner,
  SaveStatusChip,
} from "./DraftRestoreBanner";

export function NewClientDialog({
  trigger,
}: {
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autosave the whole form to localStorage as she types. Keyed by
  // "new-client" (only one new-client form can be open at a time). Hook
  // is inert until the dialog actually mounts the form.
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useDraft<Record<string, string>>(
    open ? "new-client" : null,
    {}
  );

  // Whether to show the restore banner. Computed lazily — only when the
  // dialog opens AND a non-empty draft is in storage.
  const storedDraft = open ? draft.readStoredValue() : null;
  const draftNonEmpty =
    !!storedDraft && Object.values(storedDraft).some((v) => v && v.trim() !== "");

  function snapshotForm() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const obj: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") obj[k] = v;
    }
    draft.saveDraft(obj);
  }

  function restoreDraftIntoForm() {
    if (!formRef.current) return;
    const stored = draft.readStoredValue();
    if (!stored) return;
    for (const [name, value] of Object.entries(stored)) {
      // namedItem can return Element | RadioNodeList — skip the latter
      // (radio groups, which we don't have on these forms). For singular
      // elements, set value via duck-typing on `value`.
      const el = formRef.current.elements.namedItem(name);
      if (el && !(el instanceof RadioNodeList) && "value" in el) {
        (el as { value: string }).value = value;
      }
    }
    draft.discardStored();
  }

  // Keyboard shortcut `n` dispatches this event globally — we open ourselves.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("shortcuts:new-client", handler);
    return () => window.removeEventListener("shortcuts:new-client", handler);
  }, []);

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-3 py-2 rounded-md inline-flex items-center gap-1.5"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          New client
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Add a new client"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-client-form"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Adding…" : "Add client"}
            </button>
          </>
        }
      >
        <form
          id="new-client-form"
          ref={formRef}
          // Autosave the whole form on every input event. Debounced inside
          // useDraft so we don't hammer localStorage.
          onInput={snapshotForm}
          action={async (fd) => {
            setSubmitting(true);
            setError(null);
            try {
              // On success this redirects to /clients/<new-id>, throwing
              // a NEXT_REDIRECT error that MUST propagate up to the framework
              // for navigation to actually happen. The catch below rethrows
              // it via rethrowIfRedirect() — only real errors get displayed.
              await createClient(fd);
              // Unreachable in the success case (createClient redirects),
              // but kept here for the non-redirecting future.
              draft.clearDraft();
              setOpen(false);
            } catch (err) {
              if (isRedirectError(err)) {
                // Success — the action redirected. Clear the draft BEFORE
                // letting the framework process the redirect, so when she
                // lands on the new client page the autosave stash is gone.
                draft.clearDraft();
                throw err;
              }
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <p className="text-xs text-ink-500">
            Just the name is required — fill in the rest as you learn about
            them. You can edit anything later from their profile.
          </p>

          {draftNonEmpty && (
            <DraftRestoreBanner
              ageMs={draft.storedAgeMs}
              onRestore={restoreDraftIntoForm}
              onDiscard={() => draft.discardStored()}
            />
          )}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

          <div className="flex justify-end -mb-2">
            <SaveStatusChip status={draft.status} />
          </div>

          <Field label="Full name" required>
            <input
              name="fullName"
              required
              autoFocus
              className={inputCls}
              placeholder="Jane Doe"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pronouns">
              <input
                name="pronouns"
                className={inputCls}
                placeholder="she/her"
              />
            </Field>
            <Field label="Email">
              <input name="email" type="email" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input name="phone" className={inputCls} />
            </Field>
            <Field label="City">
              <input name="city" className={inputCls} />
            </Field>
          </div>

          <Field
            label="Birthday"
            hint="Optional. When it comes around, you'll see it on Today."
          >
            <input
              name="dob"
              type="date"
              className={`${inputCls} md:w-64`}
            />
          </Field>

          <Field label="What they're working on" hint="Short phrase you'll see in the client list">
            <input
              name="workingOn"
              className={inputCls}
              placeholder="In a few words, what they came in around"
            />
          </Field>

          <Field label="About this client" hint="Anything you want to remember every time you see them">
            <textarea
              name="aboutClient"
              rows={3}
              className={inputCls}
            />
          </Field>

          <Field label="Tags" hint="Comma-separated. Use whatever vocabulary helps you find them later.">
            <input
              name="tags"
              className={inputCls}
              placeholder="e.g. weekly, longterm"
            />
          </Field>

          <Field
            label="Sensitivity flags (optional)"
            hint="Topics to handle gently. A soft reminder at the top of their file — only you see this."
          >
            <input
              name="sensitivities"
              className={inputCls}
              placeholder="e.g. recent loss, sensitive about money"
            />
          </Field>

          <Field label="How they found me">
            <input
              name="howTheyFoundMe"
              className={inputCls}
              placeholder="Instagram / referral / website"
            />
          </Field>

          <Field
            label="Preferred language"
            hint="Used when emailing — templates filter to this language. Blank = follow app language."
          >
            <select
              name="preferredLanguage"
              defaultValue=""
              className={`${inputCls} md:w-64`}
            >
              <option value="">Follow app language</option>
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>

          <div className="border-t border-ink-100 pt-4 mt-2">
            <Field
              label="First session date"
              required
              hint="Locks in the follow-up rhythm: 1 week, 1 month, and 3 months after this date. Past or future is fine."
            >
              <input
                name="firstSessionDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputCls}
              />
            </Field>
            <Field label="First session type">
              <input
                name="firstSessionType"
                defaultValue="Session"
                className={inputCls}
                placeholder="Whatever you call this kind of session"
              />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
