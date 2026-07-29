"use client";

// The little count next to "Requests" in the sidebar.
//
// Counts every ask a *person* is waiting on: portal reschedule + session
// requests, Circle sign-ups, refund requests, and Library purchases.
// Deliberately NOT her own backlog (unwritten notes, missing intentions,
// un-retried bots) — a number that never reaches zero stops meaning anything.
// This one goes away when nobody is waiting on her.
//
// Refetches whenever the route changes, which covers the realistic case
// (she acts on a request, lands back on another page, the badge clears).
// No polling — an idle tab doesn't need to hit the DB every 30 seconds.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function RequestsBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/requests/count", { cache: "no-store" })
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
          ? "1 client is waiting on you"
          : `${count} clients are waiting on you`
      }
    >
      {count}
    </span>
  );
}
