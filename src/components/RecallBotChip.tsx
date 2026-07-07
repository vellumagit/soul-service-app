"use client";

// Small chip that sits in the action row of every SessionCard, showing
// what the Recall.ai notetaker bot is doing for this session (and offering
// a manual "Add bot now" / "Cancel bot" affordance).
//
// State logic:
//   1. Transcript already received → "✓ Auto-notes" (sage chip, done).
//   2. Bot exists, status pending → live status chip (joining / in call /
//      done-but-no-transcript-yet). Includes a "Cancel bot" button.
//   3. No bot AND meet URL present AND session in future → "Add notetaker" button.
//   4. Anything else → nothing rendered (no Meet, past session, etc.).
//
// The "Add notetaker" button is the emergency / manual override path —
// useful when auto-add wasn't on at schedule time, or when the meeting
// got moved around outside Soul Service, or when an auto-added bot
// crashed and a fresh one is needed.

import { useState, useTransition } from "react";
import { addBotToSessionNow, cancelBotForSession } from "@/lib/actions";
import { notify } from "./FlashNotifier";

type Props = {
  sessionId: string;
  status: string | null;
  hasMeetUrl: boolean;
  scheduledAt: Date;
  transcriptReceivedAt: Date | null;
  sessionStatus: "scheduled" | "completed" | "cancelled" | "no_show" | string;
};

export function RecallBotChip({
  sessionId,
  status,
  hasMeetUrl,
  scheduledAt,
  transcriptReceivedAt,
  sessionStatus,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<"adding" | "cancelling" | null>(
    null
  );

  // 1. Transcript came in — the magical happy-path.
  if (transcriptReceivedAt) {
    return (
      <span
        className="chip border bg-sage-50 text-sage-700"
        style={{ borderColor: "var(--color-sage-100)" }}
        title="The notetaker bot's transcript was structured into the session notes."
      >
        ✓ Auto-notes
      </span>
    );
  }

  // 2. A bot is attached — show its live status + offer cancel.
  if (status) {
    const label = labelForStatus(status);
    return (
      <span className="flex items-center gap-1.5">
        <span
          className="chip border bg-plum-50 text-plum-700"
          style={{ borderColor: "var(--color-plum-100)" }}
          title={`Recall bot status: ${status}`}
        >
          {label}
        </span>
        {/* Cancel only useful when the bot hasn't already finished. */}
        {!status.startsWith("done") && !status.startsWith("fatal") && (
          <button
            type="button"
            disabled={pending || optimistic === "cancelling"}
            onClick={() =>
              startTransition(async () => {
                setOptimistic("cancelling");
                const r = await cancelBotForSession(sessionId);
                setOptimistic(null);
                if (!r.ok) {
                  notify({
                    kind: "warning",
                    title: "Couldn't cancel bot",
                    body: r.error,
                  });
                } else {
                  notify({
                    kind: "success",
                    title: "Bot cancelled",
                    ttlMs: 2500,
                  });
                }
              })
            }
            className="text-[11px] text-ink-400 hover:text-amber-700 disabled:opacity-50"
            title="Stop the bot before it joins (or pull it out of the call if it's already in)"
          >
            cancel
          </button>
        )}
      </span>
    );
  }

  // 3. No bot, but a Meet URL exists + the session isn't cancelled → offer
  // to add one. We also show this for in-progress / about-to-start sessions
  // where auto-add couldn't run (e.g. recall was off then).
  if (!hasMeetUrl) return null;
  if (sessionStatus === "cancelled") return null;
  // Don't show for sessions that ended long ago — no Meet to join.
  const minutesPast = (Date.now() - scheduledAt.getTime()) / (60 * 1000);
  if (minutesPast > 30) return null;

  return (
    <button
      type="button"
      disabled={pending || optimistic === "adding"}
      onClick={() =>
        startTransition(async () => {
          setOptimistic("adding");
          const r = await addBotToSessionNow(sessionId);
          setOptimistic(null);
          if (!r.ok) {
            notify({
              kind: "warning",
              title: "Couldn't add notetaker",
              body: r.error,
            });
          } else {
            notify({
              kind: "success",
              title: "Notetaker is joining",
              body: "The bot is on its way into the call.",
              ttlMs: 3000,
            });
          }
        })
      }
      className="text-xs text-plum-700 hover:underline font-medium inline-flex items-center gap-1 disabled:opacity-50"
      title="Spawn a Recall.ai notetaker bot to join this Meet now"
    >
      <svg
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4v16m8-8H4"
        />
      </svg>
      {optimistic === "adding" ? "Adding…" : "Add notetaker"}
    </button>
  );
}

// Map Recall's bot.status_change codes to friendly labels. New codes Recall
// might add in the future fall through to the raw code.
function labelForStatus(code: string): string {
  switch (code) {
    case "scheduled":
      return "Bot scheduled";
    case "ready":
      return "Bot ready";
    case "joining_call":
      return "Bot joining…";
    case "in_waiting_room":
      return "Bot in lobby…";
    case "in_call_not_recording":
      return "Bot in call";
    case "in_call_recording":
      return "Bot recording";
    case "recording_permission_denied":
      return "Recording blocked";
    case "call_ended":
    case "done":
      return "Notes incoming…";
    case "transcribing":
      return "Transcribing…";
    case "fatal":
      return "Bot failed";
    default:
      return `Bot: ${code}`;
  }
}
