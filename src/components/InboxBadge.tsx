"use client";

// The little count next to "Inbox" in the sidebar.
//
// Counts NEW inbound messages waiting for her — pending lead-form submissions
// (contact-form notes, quiz leads, lead-magnet sign-ups). Clears as she triages
// them in /network/inbox. Spam and already-handled items don't count.
//
// Refetches whenever the route changes (she reads a message, lands elsewhere,
// the badge updates) — no polling, so an idle tab doesn't hit the DB on a timer.
// Mirrors RequestsBadge exactly.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function InboxBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => {
        if (!cancelled) setCount(Number(d?.count) || 0);
      })
      .catch(() => {
        // Quiet on failure — a badge is not worth an error surface.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (count <= 0) return null;

  return (
    <span
      className="shrink-0 min-w-[18px] px-1.5 h-[18px] inline-flex items-center justify-center rounded-full text-[10px] font-mono"
      style={{
        background: "var(--color-honey-700, #b05c36)",
        color: "#fff",
      }}
      title={
        count === 1
          ? "1 new message in your inbox"
          : `${count} new messages in your inbox`
      }
    >
      {count}
    </span>
  );
}
