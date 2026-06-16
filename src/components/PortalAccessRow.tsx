"use client";

// A small row on the client overview that surfaces portal access state:
//   - if portalEnabled is false → nothing (no clutter for clients who
//     don't have access).
//   - if portalEnabled is true → "Last visit X ago" + a "Send portal
//     invite →" button that emails a fresh magic link.
//
// Sits just below ClientHeader so it's discoverable when she enables
// access, then disappears once she's used the button + the client has
// signed in (the "Last visit" line carries it from then on).

import { useState, useTransition } from "react";
import { sendPortalInvite } from "@/lib/actions";
import { notify } from "./FlashNotifier";

export function PortalAccessRow({
  clientId,
  clientFirstName,
  enabled,
  lastVisitAt,
}: {
  clientId: string;
  clientFirstName: string;
  enabled: boolean;
  lastVisitAt: Date | null;
}) {
  const [pending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  if (!enabled) return null;

  const lastVisitLabel = lastVisitAt
    ? humanizeAgo(new Date(lastVisitAt))
    : null;

  return (
    <div
      className="mb-5 rounded-md px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
      style={{
        background: "var(--color-honey-50)",
        border: "1px solid var(--color-honey-100)",
      }}
    >
      <div className="text-[12px] text-honey-700 flex items-center gap-2 flex-wrap">
        <span aria-hidden="true">◇</span>
        <span>
          Client portal access is{" "}
          <span className="font-medium">on</span> for {clientFirstName}.
        </span>
        {lastVisitLabel ? (
          <span className="text-ink-500 italic">
            Last signed in {lastVisitLabel}.
          </span>
        ) : (
          <span className="text-ink-500 italic">
            They haven&apos;t signed in yet.
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={pending || !!sentTo}
        onClick={() =>
          startTransition(async () => {
            const r = await sendPortalInvite(clientId);
            if (!r.ok) {
              notify({
                kind: "warning",
                title: "Couldn't send portal invite",
                body: r.error,
              });
              return;
            }
            setSentTo(r.sentTo);
            notify({
              kind: "success",
              title: "Portal invite sent",
              body: `Magic link sent to ${r.sentTo}.`,
              ttlMs: 4000,
            });
          })
        }
        className="text-xs font-medium text-honey-700 hover:underline disabled:opacity-60 shrink-0"
      >
        {sentTo
          ? "✓ Sent"
          : pending
          ? "Sending…"
          : lastVisitLabel
          ? "Resend portal invite →"
          : "Send portal invite →"}
      </button>
    </div>
  );
}

function humanizeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
