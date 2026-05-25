"use client";

// Per-session "Push to Google Calendar" / "On your calendar" indicator.
// Lives in the SessionCard footer next to the Meet link.
//
// Why this exists:
// - Sessions saved while Google Calendar was disconnected (or while sync was
//   silently broken) have no `googleEventId`. The UI used to just hide them
//   — the practitioner had no way to retroactively push them to her calendar.
// - This makes the sync state VISIBLE per-session and gives her a one-click
//   retry. If the retry fails, the actual Google error surfaces via toast so
//   she knows whether to reconnect, fix scope, etc.

import { useState, useTransition } from "react";
import { syncSessionToGoogleAction } from "@/lib/actions";
import { notify } from "./FlashNotifier";
import { rethrowIfRedirect } from "@/lib/redirect-error";

export function PushToGoogleButton({
  sessionId,
  hasGoogleEvent,
}: {
  sessionId: string;
  hasGoogleEvent: boolean;
}) {
  const [pending, start] = useTransition();
  const [synced, setSynced] = useState(hasGoogleEvent);

  function push() {
    start(async () => {
      try {
        const result = await syncSessionToGoogleAction(sessionId);
        if (result.ok) {
          setSynced(true);
          notify({
            kind: "success",
            title: "Pushed to Google Calendar",
            body: result.meetUrl
              ? "Event created with a Meet link."
              : "Event created on your primary calendar.",
            ttlMs: 4000,
          });
        } else {
          notify({
            kind: "error",
            title: "Google sync failed",
            body: result.error.slice(0, 280),
            actionHref: "/status",
            actionLabel: "Diagnose on Status",
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

  if (synced) {
    return (
      <span
        className="text-[11px] inline-flex items-center gap-1 text-sage-700"
        title="This session has a matching Google Calendar event"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        On your calendar
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={push}
      disabled={pending}
      className="text-xs text-ink-500 hover:text-plum-700 underline-offset-2 hover:underline disabled:opacity-60"
      title="Create a Google Calendar event for this session"
    >
      {pending ? "Pushing…" : "Push to Google Calendar"}
    </button>
  );
}
