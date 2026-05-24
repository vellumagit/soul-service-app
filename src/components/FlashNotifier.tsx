"use client";

// Lightweight toast/flash banner. Mounted once in AppShell. Anywhere in the
// app can fire one via:
//
//   notify({ kind: "warning", title: "...", body: "...", actionHref?: "..." })
//
// Why this exists: post-action dialogs sometimes need to tell the user
// something happened (e.g. "session saved, but Google Calendar sync failed")
// WITHOUT keeping the dialog open and making the save look broken. Closing
// the dialog and surfacing the message here keeps the save loop snappy while
// still being honest about secondary failures.
//
// Auto-dismisses after 8s by default; user can dismiss any time with the X.
// Stacks up to 3 notices at once.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type NoticeKind = "info" | "warning" | "error" | "success";

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body?: string;
  actionHref?: string;
  actionLabel?: string;
  /** Milliseconds before auto-dismiss. Defaults to 8000. Pass 0 for sticky. */
  ttlMs?: number;
};

// Dispatcher — call from anywhere in client code.
export function notify(notice: Omit<Notice, "id">) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("app:notify", {
      detail: { ...notice, id: crypto.randomUUID() } as Notice,
    })
  );
}

export function FlashNotifier() {
  const [notices, setNotices] = useState<Notice[]>([]);

  const remove = useCallback((id: string) => {
    setNotices((all) => all.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<Notice>;
      const notice = ce.detail;
      setNotices((all) => {
        // Keep at most 3 — drop the oldest if we'd exceed.
        const next = [...all, notice];
        return next.slice(-3);
      });
      const ttl = notice.ttlMs ?? 8000;
      if (ttl > 0) {
        setTimeout(() => remove(notice.id), ttl);
      }
    }
    window.addEventListener("app:notify", handler as EventListener);
    return () =>
      window.removeEventListener("app:notify", handler as EventListener);
  }, [remove]);

  if (notices.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-md pointer-events-none"
      aria-live="polite"
    >
      {notices.map((n) => (
        <NoticeCard key={n.id} notice={n} onDismiss={() => remove(n.id)} />
      ))}
    </div>
  );
}

function NoticeCard({
  notice,
  onDismiss,
}: {
  notice: Notice;
  onDismiss: () => void;
}) {
  const tone = TONE[notice.kind];
  return (
    <div
      className={`pointer-events-auto rounded-lg shadow-lg border px-4 py-3 flex items-start gap-3 ${tone.wrap}`}
      role="status"
    >
      <div className={`mt-0.5 ${tone.icon}`}>{tone.glyph}</div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${tone.title}`}>{notice.title}</div>
        {notice.body && (
          <div className={`text-xs mt-0.5 leading-relaxed ${tone.body}`}>
            {notice.body}
          </div>
        )}
        {notice.actionHref && (
          <Link
            href={notice.actionHref}
            onClick={onDismiss}
            className={`text-xs font-medium mt-1.5 inline-block hover:underline ${tone.action}`}
          >
            {notice.actionLabel ?? "Open"} →
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className={`shrink-0 ${tone.dismiss} hover:opacity-100 opacity-60`}
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
  );
}

const TONE: Record<
  NoticeKind,
  {
    wrap: string;
    icon: string;
    title: string;
    body: string;
    action: string;
    dismiss: string;
    glyph: React.ReactNode;
  }
> = {
  info: {
    wrap: "bg-white border-ink-200",
    icon: "text-plum-600",
    title: "text-ink-900",
    body: "text-ink-600",
    action: "text-plum-700",
    dismiss: "text-ink-400",
    glyph: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  warning: {
    wrap: "bg-amber-50 border-amber-200",
    icon: "text-amber-700",
    title: "text-amber-900",
    body: "text-amber-800",
    action: "text-amber-900",
    dismiss: "text-amber-700",
    glyph: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  error: {
    wrap: "bg-red-50 border-red-200",
    icon: "text-red-700",
    title: "text-red-900",
    body: "text-red-700",
    action: "text-red-800",
    dismiss: "text-red-600",
    glyph: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  success: {
    wrap: "bg-white border-sage-100",
    icon: "text-sage-700",
    title: "text-ink-900",
    body: "text-ink-600",
    action: "text-sage-700",
    dismiss: "text-ink-400",
    glyph: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
};
