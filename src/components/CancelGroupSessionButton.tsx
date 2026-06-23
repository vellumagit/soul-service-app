"use client";

import { useTransition } from "react";
import { cancelGroupSession } from "@/lib/group-actions";

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
        `Cancel the ${scheduledAtLabel} session? Sign-ups stay on the books — you can reach out to refund.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      await cancelGroupSession(sessionId);
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
