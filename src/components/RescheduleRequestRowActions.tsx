"use client";

// Two inline actions on a reschedule-request row in Loose Ends:
//   - "Open the session" → standard link to the client's Sessions tab anchor
//   - "Resolve →" → marks the row resolved (calls resolveRescheduleRequest)
// The expected workflow: she clicks "Open the session" to reschedule via the
// existing flow, then comes back and clicks "Resolve" to clear the loose end.
// (We don't auto-resolve on session reschedule because she may have just
// dismissed without action; explicit resolution avoids guessing.)

import Link from "next/link";
import { useState, useTransition } from "react";
import { resolveRescheduleRequest } from "@/lib/actions";
import { notify } from "./FlashNotifier";

export function RescheduleRequestRowActions({
  requestId,
  clientId,
  sessionId,
}: {
  requestId: string;
  clientId: string;
  sessionId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [resolved, setResolved] = useState(false);

  return (
    <div className="flex items-center gap-3 text-xs">
      <Link
        href={`/clients/${clientId}?tab=sessions#${sessionId}`}
        className="text-plum-700 hover:underline font-medium"
      >
        Open the session →
      </Link>
      <span className="text-ink-300">·</span>
      <button
        type="button"
        disabled={pending || resolved}
        onClick={() =>
          startTransition(async () => {
            const r = await resolveRescheduleRequest(requestId);
            if (!r.ok) {
              notify({
                kind: "warning",
                title: "Couldn't resolve",
                body: r.error,
              });
              return;
            }
            setResolved(true);
            notify({
              kind: "success",
              title: "Resolved",
              body: "The request is cleared from your Loose ends.",
              ttlMs: 2500,
            });
          })
        }
        className="text-ink-500 hover:text-ink-900 hover:underline disabled:opacity-60"
      >
        {resolved ? "✓ Resolved" : pending ? "Resolving…" : "Resolve →"}
      </button>
    </div>
  );
}
