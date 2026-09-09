"use client";

// Keeps a home-screen install (or a long-lived tab) on the CURRENT build.
//
// Why: an installed app resumes from its last-rendered state and never
// refetches on its own — after a day of deploys it was still showing a
// snapshot from the morning, missing buttons that had shipped hours earlier.
// Every deploy also changes server-action ids, so a stale page's clicks can
// silently fail.
//
// How: the page carries the sha it was built from (NEXT_PUBLIC_BUILD_SHA);
// /api/version reports the sha that is RUNNING. We compare on every resume
// (visibility, focus, pageshow — which is what fires when an installed app
// comes back to the foreground on iOS and Android), every 5 minutes, and once
// on load. Behind? Reload — immediately when nothing is being typed and no
// dialog is open, otherwise a banner with a Refresh button so no half-typed
// note is lost. Reloads at most once per build (sessionStorage), so a
// misconfigured sha can never loop.
//
// Also registers the service worker (production only). It is network-first,
// so it cannot pin an old version — it exists for the install + offline page.

import { useEffect, useRef, useState } from "react";

const RELOADED_KEY = "__ss_reloaded_for";

export function UpdateBeacon() {
  const [stale, setStale] = useState(false);
  const inflight = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const mine = process.env.NEXT_PUBLIC_BUILD_SHA;
    if (!mine || mine === "dev") return;

    let cancelled = false;

    const safeToReload = () => {
      if (document.querySelector("dialog[open]")) return false;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return false;
      if (el?.isContentEditable) return false;
      return true;
    };

    const alreadyReloadedFor = (sha: string) => {
      try {
        return sessionStorage.getItem(RELOADED_KEY) === sha;
      } catch {
        return false;
      }
    };
    const markReloaded = (sha: string) => {
      try {
        sessionStorage.setItem(RELOADED_KEY, sha);
      } catch {
        /* storage unavailable — fall through to the banner next time */
      }
    };

    async function check() {
      if (cancelled || inflight.current) return;
      inflight.current = true;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { sha } = (await res.json()) as { sha?: string };
        if (!sha || sha === "dev" || sha === mine) return;
        if (safeToReload() && !alreadyReloadedFor(sha)) {
          markReloaded(sha);
          window.location.reload();
          return;
        }
        setStale(true);
      } catch {
        // Offline / transient — try again on the next resume.
      } finally {
        inflight.current = false;
      }
    }

    const onResume = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    const interval = window.setInterval(check, 5 * 60 * 1000);
    void check();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
      window.clearInterval(interval);
    };
  }, []);

  if (!stale) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[9998] flex items-center justify-center gap-3 px-4 py-3 bg-plum-700 text-white text-sm shadow-lg"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <span>Soul Service was updated.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="px-3 py-1.5 rounded-md bg-white text-plum-700 font-medium"
      >
        Refresh
      </button>
    </div>
  );
}
