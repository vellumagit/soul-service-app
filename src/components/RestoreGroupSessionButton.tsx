"use client";

// A cancelled Circle is back on: calendar entry re-created quietly, pending
// refund requests withdrawn, guests who still hold a seat emailed once.

import { restoreGroupSession } from "@/lib/group-actions";
import { ConfirmButton } from "./ConfirmButton";
import { notify } from "./FlashNotifier";

export function RestoreGroupSessionButton({
  sessionId,
  scheduledAtLabel,
}: {
  sessionId: string;
  scheduledAtLabel: string;
}) {
  return (
    <ConfirmButton
      destructive={false}
      label={
        <span className="text-[11px] text-plum-700 hover:underline">Restore</span>
      }
      message={`Put the ${scheduledAtLabel} Circle back on? Guests who still hold a seat keep it, any refunds you haven't paid out yet are withdrawn, and the calendar entry comes back. Guests already refunded stay cancelled — reinstate them one by one if they're coming.`}
      option={{
        label: "Email the guests that it's back on",
        defaultChecked: true,
        hint: "One email each. Untick if they already know.",
      }}
      confirmLabel="Yes, restore it"
      onConfirm={async (notifyGuests) => {
        const r = await restoreGroupSession(sessionId, { notify: notifyGuests });
        if (!r.ok) throw new Error(r.error);
        const bits: string[] = [];
        if (r.notified > 0) bits.push(`${r.notified} ${r.notified === 1 ? "guest" : "guests"} emailed`);
        if (r.refundRequestsCleared > 0)
          bits.push(`${r.refundRequestsCleared} refund ${r.refundRequestsCleared === 1 ? "request" : "requests"} withdrawn`);
        notify({
          kind: "success",
          title: "Circle restored",
          body: bits.length > 0 ? bits.join(" · ") : "Back on the calendar.",
          ttlMs: 5000,
        });
      }}
    />
  );
}
