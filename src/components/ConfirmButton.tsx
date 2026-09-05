"use client";

import { useRef, useState, useTransition } from "react";
import { rethrowIfRedirect } from "@/lib/redirect-error";

// A button that opens a real "Are you sure?" dialog before firing its action.
// Use everywhere a destructive action would otherwise need a "tap again" hack.
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = "Yes, do it",
  message,
  className,
  destructive = true,
  option,
}: {
  /** Receives the optional checkbox's state (true when no `option` is set). */
  onConfirm: (optionChecked: boolean) => Promise<void> | void;
  label: React.ReactNode;
  confirmLabel?: string;
  message: string;
  className?: string;
  destructive?: boolean;
  /** An optional checkbox inside the dialog — e.g. "Email the client". Its
   *  value is passed to onConfirm so the action can behave accordingly. */
  option?: { label: string; defaultChecked?: boolean; hint?: string };
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optionChecked, setOptionChecked] = useState(
    option?.defaultChecked ?? true
  );

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          className ??
          `text-xs ${
            destructive
              ? "text-ink-500 hover:text-red-700"
              : "text-ink-500 hover:text-ink-900"
          }`
        }
      >
        {label}
      </button>
      {/* Center explicitly (fixed inset-0 + m-auto). Tailwind v4's reset zeroes
          the UA margin:auto that centers a modal <dialog>, so without this it
          drifts to the top-left — the same bug the search palette had. */}
      <dialog
        ref={dialogRef}
        className="rounded-md border border-ink-200 shadow-2xl p-0 backdrop:bg-ink-900/40 max-w-sm w-full fixed inset-0 m-auto"
      >
        <div className="p-5">
          <div className="text-sm text-ink-900 font-medium mb-2">
            Are you sure?
          </div>
          <div className="text-sm text-ink-600 leading-relaxed">{message}</div>
          {option && (
            <label className="mt-3 flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
              <input
                type="checkbox"
                checked={optionChecked}
                onChange={(e) => setOptionChecked(e.target.checked)}
                disabled={pending}
                className="mt-0.5"
              />
              <span>
                {option.label}
                {option.hint && (
                  <span className="block text-xs text-ink-400">{option.hint}</span>
                )}
              </span>
            </label>
          )}
          {error && (
            <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-100 bg-ink-50/40">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-100 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  await onConfirm(option ? optionChecked : true);
                  close();
                } catch (err) {
                  // If onConfirm called redirect(), let it propagate so
                  // navigation actually happens — otherwise the dialog
                  // would silently appear to "work" but stay put.
                  rethrowIfRedirect(err);
                  setError(
                    err instanceof Error ? err.message : "Something went wrong"
                  );
                }
              })
            }
            className={`px-3 py-1.5 text-sm rounded font-medium text-white disabled:opacity-60 ${
              destructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-ink-900 hover:bg-ink-800"
            }`}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
