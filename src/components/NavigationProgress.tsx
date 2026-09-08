"use client";

// A thin progress bar along the top edge while a client-side navigation is in
// flight. The App Router gives no feedback between a click and the server's
// response — with a scaled-to-zero database that can be seconds of dead air,
// which reads as "the click didn't work". This makes the click visibly land.
//
// Why not loading.tsx? Pages render their own <AppShell>, so a route-level
// fallback would blank out the nav and header mid-navigation. A bar over the
// existing page is calmer and never removes chrome.
//
// Starts on same-origin link clicks (capture phase, so a link's own handler
// can't swallow it) and on back/forward; finishes when the route actually
// changes. A 12s safety timeout clears it if a navigation never lands.

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Phase = "idle" | "active" | "done";

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = `${pathname}?${search.toString()}`;
  const lastKey = useRef(key);
  const [phase, setPhase] = useState<Phase>("idle");
  const safety = useRef<number | null>(null);

  useEffect(() => {
    const start = () => {
      setPhase("active");
      if (safety.current) window.clearTimeout(safety.current);
      safety.current = window.setTimeout(() => setPhase("idle"), 12_000);
    };
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as Element | null)?.closest?.(
        "a[href]"
      ) as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      // Same page (hash jump, re-click of the current route): nothing to show.
      if (url.pathname + url.search === location.pathname + location.search)
        return;
      start();
    };
    const onPop = () => start();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      if (safety.current) window.clearTimeout(safety.current);
    };
  }, []);

  // The route committed → sweep to 100% and fade.
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    setPhase((p) => (p === "active" ? "done" : p));
    const t = window.setTimeout(() => setPhase("idle"), 400);
    return () => window.clearTimeout(t);
  }, [key]);

  return <div aria-hidden className={`nav-progress ${phase}`} />;
}

export function NavigationProgress() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
