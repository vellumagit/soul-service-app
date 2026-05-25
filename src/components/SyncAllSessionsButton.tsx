"use client";

// "Sync all unsynced sessions to Google Calendar" — the bulk catch-up button.
// Lives on the /status page next to the per-account Google connection row.
//
// When she's been operating with broken Google sync for a while, every
// session she scheduled in that window has no `googleEventId`. Without a
// catch-up tool she'd have to walk each session in the UI and click "Push
// to Google Calendar." This does the whole backlog in one click.
//
// Capped at 25 per click so the action fits well inside Vercel's function
// timeout — for bigger backlogs she clicks again and the response tells her
// how many remain.

import { useState, useTransition } from "react";
import { syncAllUnsyncedToGoogleAction } from "@/lib/actions";
import { notify } from "./FlashNotifier";
import { rethrowIfRedirect } from "@/lib/redirect-error";

export function SyncAllSessionsButton() {
  const [pending, start] = useTransition();
  const [lastResult, setLastResult] = useState<{
    synced: number;
    failed: number;
    remaining: number;
  } | null>(null);

  function run() {
    start(async () => {
      try {
        const result = await syncAllUnsyncedToGoogleAction();
        setLastResult({
          synced: result.synced,
          failed: result.failed,
          remaining: result.remaining,
        });

        // Three flavors of feedback:
        //   (a) nothing was unsynced — celebrate quietly
        //   (b) some succeeded — say how many, and how many remain
        //   (c) all failed — show the first error and link to /status diagnostic
        if (result.synced === 0 && result.failed === 0 && result.remaining === 0) {
          notify({
            kind: "info",
            title: "Already in sync",
            body: "Every session in your account has a matching Google Calendar event.",
            ttlMs: 5000,
          });
        } else if (result.synced > 0 && result.failed === 0) {
          notify({
            kind: "success",
            title:
              result.remaining > 0
                ? `Synced ${result.synced} — ${result.remaining} to go`
                : `Synced ${result.synced} session${result.synced === 1 ? "" : "s"}`,
            body:
              result.remaining > 0
                ? "Click again to keep going."
                : "All your sessions are now on Google Calendar.",
            ttlMs: 6000,
          });
        } else if (result.synced > 0 && result.failed > 0) {
          notify({
            kind: "warning",
            title: `Synced ${result.synced}, ${result.failed} failed`,
            body: result.firstError
              ? `First failure: ${result.firstError.slice(0, 200)}`
              : "Some sessions couldn't be pushed.",
            actionHref: "/status",
            actionLabel: "Diagnose",
            ttlMs: 14000,
          });
        } else {
          notify({
            kind: "error",
            title: "Google sync failed",
            body: result.firstError ?? "All sessions failed to sync.",
            actionHref: "/status",
            actionLabel: "Test Google",
            ttlMs: 14000,
          });
        }
      } catch (err) {
        rethrowIfRedirect(err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        notify({
          kind: "error",
          title: "Couldn't reach the server",
          body: msg.slice(0, 280),
          ttlMs: 10000,
        });
      }
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-xs font-medium border border-ink-200 hover:bg-ink-50 px-3 py-1.5 rounded-md disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Sync all sessions to Google Calendar"}
      </button>
      {lastResult && (
        <div className="text-[11px] text-ink-500 leading-relaxed">
          Last run: {lastResult.synced} synced
          {lastResult.failed > 0 && `, ${lastResult.failed} failed`}
          {lastResult.remaining > 0 &&
            `, ${lastResult.remaining} still to go — click again`}
          {lastResult.synced === 0 &&
            lastResult.failed === 0 &&
            lastResult.remaining === 0 &&
            " (nothing to catch up)"}
          .
        </div>
      )}
    </div>
  );
}
