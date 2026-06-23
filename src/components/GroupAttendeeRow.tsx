"use client";

// Single attendee row on the group session detail page. Has inline
// buttons for "Mark paid + Confirm", "Confirm only", and "Cancel".

import { useState, useTransition } from "react";
import {
  confirmAttendee,
  markAttendeeCancelled,
} from "@/lib/group-actions";

interface Props {
  attendee: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string; // pending | confirmed | cancelled
    paid: boolean;
    paidAt: Date | null;
    createdAt: Date;
  };
}

export function GroupAttendeeRow({ attendee }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isCancelled = attendee.status === "cancelled";
  const isConfirmed = attendee.status === "confirmed";

  function handleConfirm(markPaid: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await confirmAttendee(attendee.id, markPaid);
      if (!r.ok) setError(r.error);
    });
  }
  function handleCancel() {
    if (!confirm(`Remove ${attendee.name} from this session?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await markAttendeeCancelled(attendee.id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div
      className={`paper-card p-4 flex items-start justify-between gap-3 ${
        isCancelled ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="serif text-base text-ink-900"
            style={{ fontWeight: 500 }}
          >
            {attendee.name}
          </span>
          {isConfirmed && !attendee.paid && (
            <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-honey-100 text-honey-700">
              confirmed · unpaid
            </span>
          )}
          {isConfirmed && attendee.paid && (
            <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-sage-100 text-sage-700">
              paid
            </span>
          )}
          {!isConfirmed && !isCancelled && (
            <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-plum-100 text-plum-700">
              pending
            </span>
          )}
          {isCancelled && (
            <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">
              cancelled
            </span>
          )}
        </div>
        <div className="text-xs text-ink-600 mt-0.5 break-all">
          {attendee.email}
          {attendee.phone && (
            <>
              <span className="text-ink-400 mx-1">·</span>
              {attendee.phone}
            </>
          )}
        </div>
        {error && (
          <p className="text-xs text-rose-700 italic mt-1.5">{error}</p>
        )}
      </div>

      {!isCancelled && (
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {!isConfirmed && (
            <button
              type="button"
              onClick={() => handleConfirm(true)}
              disabled={pending}
              className="px-2.5 py-1 text-[11px] font-medium bg-plum-700 hover:bg-plum-600 text-white rounded-md disabled:opacity-50"
            >
              Mark paid + Confirm
            </button>
          )}
          {!isConfirmed && (
            <button
              type="button"
              onClick={() => handleConfirm(false)}
              disabled={pending}
              className="px-2.5 py-1 text-[11px] text-ink-700 hover:text-ink-900 disabled:opacity-50"
            >
              Confirm only
            </button>
          )}
          {isConfirmed && !attendee.paid && (
            <button
              type="button"
              onClick={() => handleConfirm(true)}
              disabled={pending}
              className="px-2.5 py-1 text-[11px] font-medium bg-plum-700 hover:bg-plum-600 text-white rounded-md disabled:opacity-50"
            >
              Mark paid
            </button>
          )}
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            className="px-2.5 py-1 text-[11px] text-ink-500 hover:text-rose-700 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
