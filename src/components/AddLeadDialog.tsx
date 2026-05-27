"use client";

// Lightweight "add someone to the network" dialog. Lives on /network and
// is the entry point for jotting down people she's met before they're
// (maybe) clients.
//
// Deliberately slim — name + how-she-met-them + optional met-on date +
// optional contact + optional working-on. No first-session field; the
// presence of that field is what triggers auto-promotion in the main
// New Client flow.
//
// Submitting redirects to /clients/<new-id> so she can immediately keep
// adding context on their profile.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { addLead } from "@/lib/actions";
import { useDraft } from "@/lib/useDraft";
import {
  DraftRestoreBanner,
  SaveStatusChip,
} from "./DraftRestoreBanner";
import { notify } from "./FlashNotifier";

export function AddLeadDialog({
  trigger,
  referrerOptions,
}: {
  /** Optional render-prop for a custom trigger (e.g. on a page header). */
  trigger?: (open: () => void) => React.ReactNode;
  /** Existing clients to offer as "referred by" — passed in from the
   *  /network page server component. */
  referrerOptions: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const draft = useDraft<Record<string, string>>(
    open ? "add-lead" : null,
    {}
  );
  const storedDraft = open ? draft.readStoredValue() : null;
  const draftNonEmpty =
    !!storedDraft &&
    Object.values(storedDraft).some((v) => v && v.trim() !== "");

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
      const el = formRef.current.elements.namedItem(name);
      if (el && !(el instanceof RadioNodeList) && "value" in el) {
        (el as { value: string }).value = value;
      }
    }
    draft.discardStored();
  }

  // Listen for the "shortcuts:add-lead" custom event so a future keyboard
  // shortcut (or external button) can open the dialog without prop-drilling.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("shortcuts:add-lead", handler);
    return () => window.removeEventListener("shortcuts:add-lead", handler);
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
          Add someone
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Add to your network"
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
              form="add-lead-form"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Adding…" : "Add to network"}
            </button>
          </>
        }
      >
        <form
          id="add-lead-form"
          ref={formRef}
          onInput={snapshotForm}
          action={async (fd) => {
            setSubmitting(true);
            setError(null);
            try {
              const result = await addLead(fd);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              draft.clearDraft();
              setOpen(false);
              notify({
                kind: "success",
                title: "Added to network",
                body: "You can flesh out their profile from here.",
                ttlMs: 3500,
              });
              router.push(`/clients/${result.clientId}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <p className="text-xs text-ink-500 leading-relaxed">
            For people you&apos;ve met but haven&apos;t held a session with yet.
            Just the name is required — you can fill in the rest later from
            their profile. Scheduling a first session will quietly move them
            into your clients.
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
              placeholder="Maria Pérez"
            />
          </Field>

          <Field
            label="Where did you meet them?"
            hint="A workshop, a referral, a DM — anything you want to remember."
          >
            <input
              name="howTheyFoundMe"
              className={inputCls}
              placeholder="Olga&rsquo;s birthday party"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="When you met" hint="Optional">
              <input name="metOn" type="date" className={inputCls} />
            </Field>
            {referrerOptions.length > 0 && (
              <Field
                label="Referred by"
                hint="Optional — link to an existing client."
              >
                <select
                  name="metViaClientId"
                  className={inputCls}
                  defaultValue=""
                >
                  <option value="">—</option>
                  {referrerOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input name="email" type="email" className={inputCls} />
            </Field>
            <Field label="Phone">
              <input name="phone" className={inputCls} />
            </Field>
          </div>

          <Field
            label="What brings them in?"
            hint="Optional. Your shorthand — the thing they came to you about."
          >
            <input
              name="workingOn"
              className={inputCls}
              placeholder="navigating a breakup"
            />
          </Field>

          <Field
            label="Private notes"
            hint="Hunches, things you noticed, anything just for you."
          >
            <textarea
              name="privateNotes"
              rows={2}
              className={`${inputCls} resize-y`}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
