"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A dialog wrapper. `open` controls visibility; we proxy that to <dialog>.
// Click-outside closes. Esc closes (built into <dialog>).
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Click-outside-content closes
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
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
      className={`rounded-lg border border-ink-200 shadow-2xl p-0 backdrop:bg-ink-900/40 w-full ${sizeCls}`}
    >
      <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-ink-400 hover:text-ink-800 p-1 -mr-1"
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
