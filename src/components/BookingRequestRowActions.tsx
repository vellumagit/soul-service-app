"use client";

// Inline actions on a booking-request row in Loose Ends.
//
// Two actions:
//   - "Open client" → navigate to the client file (no specific session yet)
//   - "Resolve →" → marks the request resolved (calls resolveBookingRequest).
//
// The expected workflow: she opens the client file, schedules a session
// via the existing ScheduleSessionDialog using one of their preferred
// times, then comes back here to resolve.

import Link from "next/link";
import { useState, useTransition } from "react";
import { resolveBookingRequest } from "@/lib/actions";
import { notify } from "./FlashNotifier";

export function BookingRequestRowActions({
  requestId,
  clientId,
}: {
  requestId: string;
  clientId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [resolved, setResolved] = useState(false);

  return (
    <div className="flex items-center gap-3 text-xs">
      <Link
        href={`/clients/${clientId}`}
        className="text-plum-700 hover:underline font-medium"
      >
        Open client →
      </Link>
      <span className="text-ink-300">·</span>
      <button
        type="button"
        disabled={pending || resolved}
        onClick={() =>
          startTransition(async () => {
            const r = await resolveBookingRequest(requestId);
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
