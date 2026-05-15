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
}: {
  onConfirm: () => Promise<void> | void;
  label: React.ReactNode;
  confirmLabel?: string;
  message: string;
  className?: string;
  destructive?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      <dialog
        ref={dialogRef}
        className="rounded-md border border-ink-200 shadow-2xl p-0 backdrop:bg-ink-900/40 max-w-sm w-full"
      >
        <div className="p-5">
          <div className="text-sm text-ink-900 font-medium mb-2">
            Are you sure?
          </div>
          <div className="text-sm text-ink-600 leading-relaxed">{message}</div>
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
                  await onConfirm();
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
