"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { createClient } from "@/lib/actions";

export function NewClientDialog({
  trigger,
}: {
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          action={async (fd) => {
            setSubmitting(true);
            setError(null);
            try {
              await createClient(fd);
              setOpen(false);
            } catch (err) {
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

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

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

          <Field label="What they're working on" hint="Short phrase you'll see in the client list">
            <input
              name="workingOn"
              className={inputCls}
              placeholder="e.g. healing after a breakup"
            />
          </Field>

          <Field label="About this client" hint="Anything you want to remember every time you see them">
            <textarea
              name="aboutClient"
              rows={3}
              className={inputCls}
            />
          </Field>

          <Field label="Tags" hint="Comma-separated. Helps you filter later (e.g. self-love, grief, ancestral)">
            <input
              name="tags"
              className={inputCls}
              placeholder="grief, self-love"
            />
          </Field>

          <Field label="How they found me">
            <input
              name="howTheyFoundMe"
              className={inputCls}
              placeholder="Instagram / referral / website"
            />
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
                defaultValue="Soul reading"
                className={inputCls}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
