"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A dialog wrapper. `open` controls visibility; we proxy that to <dialog>.
// Click-outside closes. Esc closes (built into <dialog>).
//
// `locked`: when true, the dialog ignores backdrop clicks, the close X, and
// the native Esc-to-close behavior. Used while an action is in flight — we
// don't want the practitioner to dismiss the dialog mid-submit and miss the
// success/error feedback (or worse, miss a Google sync warning because the
// modal vanished before the action returned).
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  locked = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Block Esc while locked. The native <dialog>'s cancel event fires on Esc.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cancelHandler = (e: Event) => {
      if (locked) e.preventDefault();
    };
    el.addEventListener("cancel", cancelHandler);
    return () => el.removeEventListener("cancel", cancelHandler);
  }, [locked]);

  // Click-outside-content closes — unless locked.
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (locked) return;
    if (e.target === ref.current) onClose();
  }

  const sizeCls = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
  }[size];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={handleBackdropClick}
      className={`rounded-lg border border-ink-200 shadow-2xl p-0 backdrop:bg-ink-900/40 w-full m-auto fixed inset-0 ${sizeCls}`}
    >
      <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          disabled={locked}
          aria-label="Close"
          className="text-ink-400 hover:text-ink-800 p-1 -mr-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-100 bg-ink-50/40">
          {footer}
        </div>
      )}
    </dialog>
  );
}
