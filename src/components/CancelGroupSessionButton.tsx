"use client";

import { useTransition } from "react";
import { cancelGroupSession } from "@/lib/group-actions";
import { notify } from "./FlashNotifier";

interface Props {
  sessionId: string;
  scheduledAtLabel: string;
}

export function CancelGroupSessionButton({
  sessionId,
  scheduledAtLabel,
}: Props) {
  const [pending, startTransition] = useTransition();
  function onClick() {
    if (
      !confirm(
        `Cancel the ${scheduledAtLabel} session? Everyone signed up is emailed, and paid seats land in Requests as refund requests.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await cancelGroupSession(sessionId);
      const bits: string[] = [];
      if (r.notified > 0) {
        bits.push(
          `${r.notified} ${r.notified === 1 ? "guest" : "guests"} emailed`
        );
      }
      if (r.refundsQueued > 0) {
        bits.push(
          `${r.refundsQueued} refund${r.refundsQueued === 1 ? "" : "s"} waiting in Requests`
        );
      }
      notify({
        kind: "success",
        title: "Session cancelled",
        body: bits.length > 0 ? bits.join(" · ") : "No one was signed up.",
        ttlMs: 5000,
      });
    });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-[11px] text-ink-500 hover:text-rose-700 disabled:opacity-50"
    >
      Cancel session
    </button>
  );
}
