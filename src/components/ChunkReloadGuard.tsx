"use client";

import { useEffect } from "react";

// Self-heal after a deploy.
//
// When Vercel ships a new build, the JS/CSS chunk filenames change. A browser
// tab still holding the PREVIOUS page points at chunk files that now 404, so
// hydration — or the next client-side navigation / dialog open — fails
// silently, and every button on the page goes dead ("dead ends"). The user has
// no idea; it just looks broken.
//
// This guard listens for the specific signals of a stale/failed chunk load and
// does ONE clean reload to pull the current build, so the page fixes itself
// instead of sitting there unresponsive.
//
// Safety:
//   - Only `/_next/` build assets and real ChunkLoadErrors trigger a reload —
//     a broken user image (e.g. a bad portrait URL) never does.
//   - At most one auto-reload per RELOAD_WINDOW_MS, tracked in sessionStorage.
//     If a reloaded page STILL can't load chunks (a genuinely broken deploy),
//     we stop rather than loop forever.
//   - Production only. In dev, Fast Refresh does its own reloading.

const RELOAD_KEY = "__ss_chunk_reload_at";
const RELOAD_WINDOW_MS = 10_000;

function looksLikeChunkError(err: unknown): boolean {
  if (err == null) return false;
  const name = typeof err === "object" ? (err as { name?: string }).name ?? "" : "";
  const msg =
    typeof err === "string"
      ? err
      : (err as { message?: string }).message ?? String(err);
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [^ ]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

// Deploying a new build also rotates Server Action IDs. A stale tab that POSTs
// an action id the fresh server no longer has gets: "Server Action <id> was not
// found on the server." Same root cause (stale client vs fresh server) → same
// cure. (These don't always surface to a global handler, so a manual refresh
// stays the guaranteed fix right after a deploy — this is best-effort.)
function looksLikeStaleServerAction(err: unknown): boolean {
  if (err == null) return false;
  const msg =
    typeof err === "string"
      ? err
      : (err as { message?: string }).message ?? String(err);
  return (
    /Server Action .* was not found on the server/i.test(msg) ||
    /failed-to-find-server-action/i.test(msg)
  );
}

function reloadOnce(why: string) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    if (Date.now() - last < RELOAD_WINDOW_MS) {
      // Already reloaded very recently — a second failure means the new build
      // is also failing to serve chunks. Don't loop; leave the page as-is.
      console.warn("[chunk-guard] chunk error persists after reload; not looping");
      return;
    }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (rare private-mode edge) — fall through and
    // reload once; worst case is a single extra reload.
  }
  console.warn(`[chunk-guard] stale build detected (${why}) — reloading to latest`);
  window.location.reload();
}

export function ChunkReloadGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    // 1) Failed dynamic import() / lazy chunk, or a stale Server Action call →
    //    unhandled promise rejection.
    const onRejection = (e: PromiseRejectionEvent) => {
      if (looksLikeChunkError(e.reason)) reloadOnce("import-rejection");
      else if (looksLikeStaleServerAction(e.reason))
        reloadOnce("stale-server-action");
    };

    // 2) A thrown ChunkLoadError / stale Server Action error, OR a
    //    <script>/<link> build asset that 404s. Resource errors don't bubble,
    //    so we listen in the CAPTURE phase.
    const onError = (e: ErrorEvent) => {
      if (looksLikeChunkError(e.error) || looksLikeChunkError(e.message)) {
        reloadOnce("error-event");
        return;
      }
      if (
        looksLikeStaleServerAction(e.error) ||
        looksLikeStaleServerAction(e.message)
      ) {
        reloadOnce("stale-server-action");
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "SCRIPT" || target.tagName === "LINK")) {
        const url =
          (target as HTMLScriptElement).src ||
          (target as HTMLLinkElement).href ||
          "";
        if (url.includes("/_next/")) reloadOnce("resource-404");
      }
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError, true); // capture: catches resource errors
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError, true);
    };
  }, []);

  return null;
}
