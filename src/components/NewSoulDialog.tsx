"use client";

import { useRef, useState } from "react";
import { createSoul } from "@/lib/actions";

const READING_TYPES = [
  { value: "soul_reading", label: "Soul reading" },
  { value: "heart_clearing", label: "Heart clearing" },
  { value: "ancestral_reading", label: "Ancestral reading" },
  { value: "love_alignment", label: "Love alignment" },
  { value: "inner_child", label: "Inner child" },
  { value: "forgiveness_ritual", label: "Forgiveness ritual" },
  { value: "first_reading_intake", label: "First reading + intake" },
];

const TONES = ["flame", "green", "rose", "blue", "purple", "amber", "ink"];

export function NewSoulDialog() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function open() {
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        onClick={open}
        className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded"
      >
        + New file
      </button>
      <dialog
        ref={dialogRef}
        className="rounded-md border border-ink-200 shadow-2xl p-0 backdrop:bg-ink-900/40 max-w-lg w-full"
      >
        <form
          action={async (formData) => {
            setSubmitting(true);
            try {
              await createSoul(formData);
              close();
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
            <div className="text-sm font-medium text-ink-900">
              Open a new soul&apos;s file
            </div>
            <button
              type="button"
              onClick={close}
              className="text-ink-400 hover:text-ink-800"
            >
              ✕
            </button>
          </div>
          <div className="p-5 space-y-3 text-sm">
            <Field label="Full name" required>
              <input
                name="fullName"
                required
                className="input"
                placeholder="Jane Doe"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pronouns">
                <input
                  name="pronouns"
                  className="input"
                  placeholder="she/her"
                />
              </Field>
              <Field label="Avatar tone">
                <select name="avatarTone" defaultValue="flame" className="input">
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <input name="email" type="email" className="input" />
              </Field>
              <Field label="Phone">
                <input name="phone" className="input" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <input name="city" className="input" />
              </Field>
              <Field label="Timezone">
                <input
                  name="timezone"
                  className="input"
                  placeholder="UTC-7 / America/Los_Angeles"
                />
              </Field>
            </div>
            <Field label="Primary reading type">
              <select
                name="primaryReadingType"
                defaultValue="soul_reading"
                className="input"
              >
                {READING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Working on">
              <input
                name="workingOn"
                className="input"
                placeholder="Short phrase naming the love work"
              />
            </Field>
            <Field label="Pinned note">
              <textarea
                name="pinnedNote"
                rows={3}
                className="input"
                placeholder="What you're holding for this soul. Persists across all readings."
              />
            </Field>
            <Field label="Source / referral">
              <input
                name="source"
                className="input"
                placeholder="Instagram / quiz / friend / Dr. Hall"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emergency contact">
                <input
                  name="emergencyName"
                  className="input"
                  placeholder="Partner / family"
                />
              </Field>
              <Field label="Emergency phone">
                <input name="emergencyPhone" className="input" />
              </Field>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-100 bg-ink-50/40">
            <button
              type="button"
              onClick={close}
              className="px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 text-xs bg-ink-900 hover:bg-ink-800 text-white rounded font-medium disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Open file"}
            </button>
          </div>
        </form>
      </dialog>
      <style>{`
        .input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid var(--color-ink-200);
          border-radius: 4px;
          font-size: 13px;
          outline: none;
        }
        .input:focus { border-color: var(--color-flame-600); }
      `}</style>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-ink-500 mb-1">
        {label}
        {required && <span className="text-flame-700"> *</span>}
      </label>
      {children}
    </div>
  );
}
