"use client";

// Inline triage buttons for a pending or unpaid group attendee on the
// Loose Ends page. Calls the same server actions as the group detail
// page — keeps the row out of the list once it's confirmed + paid.

import { useState, useTransition } from "react";
import {
  confirmAttendee,
  markAttendeeCancelled,
} from "@/lib/group-actions";

interface Props {
  attendeeId: string;
  isPending: boolean;
  isPaid: boolean;
}

export function GroupSignupRowActions({
  attendeeId,
  isPending,
  isPaid,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onConfirm(markPaid: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await confirmAttendee(attendeeId, markPaid);
      if (!r.ok) setError(r.error);
    });
  }
  function onCancel() {
    if (!confirm("Remove this sign-up?")) return;
    setError(null);
    startTransition(async () => {
      const r = await markAttendeeCancelled(attendeeId);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isPending && (
        <button
          type="button"
          onClick={() => onConfirm(true)}
          disabled={pending}
          className="px-2.5 py-1 text-[11px] font-medium bg-plum-700 hover:bg-plum-600 text-white rounded-md disabled:opacity-50"
        >
          Mark paid + Confirm
        </button>
      )}
      {isPending && (
        <button
          type="button"
          onClick={() => onConfirm(false)}
          disabled={pending}
          className="px-2.5 py-1 text-[11px] text-ink-700 hover:text-ink-900 disabled:opacity-50"
        >
          Confirm only
        </button>
      )}
      {!isPending && !isPaid && (
        <button
          type="button"
          onClick={() => onConfirm(true)}
          disabled={pending}
          className="px-2.5 py-1 text-[11px] font-medium bg-plum-700 hover:bg-plum-600 text-white rounded-md disabled:opacity-50"
        >
          Mark paid
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="px-2.5 py-1 text-[11px] text-ink-500 hover:text-rose-700 disabled:opacity-50"
      >
        Remove
      </button>
      {error && (
        <span className="text-[11px] text-rose-700 italic">{error}</span>
      )}
    </div>
  );
}
