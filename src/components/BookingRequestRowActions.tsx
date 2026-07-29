"use client";

// Inline actions on a booking-request row in Requests.
//
// The whole loop, in the order she'd actually do it:
//
//   Reply →      write back and agree a time. Marks the request ANSWERED,
//                which is what tells the client's portal someone is on it.
//   Text / Call  only when there's a phone. Tap-to-text links, not real SMS —
//                this app has no Twilio, and pretending otherwise would be
//                worse than a link that opens her own Messages app.
//   Schedule →   opens the client file, where the session gets booked.
//                Booking it auto-resolves this request (see scheduleSession),
//                so she never has to come back here to tick it off.
//   Resolve →    the manual escape hatch: they changed their mind, or it got
//                settled outside the app.
//
// Before this the only actions were "Open client" and "Resolve", so there was
// no way to say "I've written to them, we're mid-conversation". The request
// either sat looking untouched or got resolved before anything was booked.

import Link from "next/link";
import { useState, useTransition } from "react";
import { resolveBookingRequest } from "@/lib/actions";
import { notify } from "./FlashNotifier";
import { RequestReplyDialog } from "./RequestReplyDialog";

export function BookingRequestRowActions({
  requestId,
  clientId,
  clientName,
  clientEmail,
  clientPhone,
  practitionerFirstName,
  askedFor,
  status,
}: {
  requestId: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  practitionerFirstName: string;
  askedFor?: string | null;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [resolved, setResolved] = useState(false);
  const answered = status === "acknowledged";

  return (
    <div className="space-y-1.5">
      {answered && (
        <p className="text-[11px] text-honey-700 font-mono uppercase tracking-wider">
          ◇ You&apos;ve replied — waiting on a time
        </p>
      )}
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <RequestReplyDialog
          kind="booking"
          requestId={requestId}
          clientName={clientName}
          clientEmail={clientEmail}
          practitionerFirstName={practitionerFirstName}
          askedFor={askedFor}
        />
        {clientPhone && (
          <>
            <span className="text-ink-300">·</span>
            <a
              href={`sms:${clientPhone}`}
              className="text-plum-700 hover:underline font-medium"
            >
              Text
            </a>
            <a
              href={`tel:${clientPhone}`}
              className="text-plum-700 hover:underline font-medium"
            >
              Call
            </a>
          </>
        )}
        <span className="text-ink-300">·</span>
        <Link
          href={`/clients/${clientId}`}
          className="text-plum-700 hover:underline font-medium"
        >
          Schedule it →
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
                body: "Cleared from your Requests.",
                ttlMs: 2500,
              });
            })
          }
          className="text-ink-500 hover:text-ink-900 hover:underline disabled:opacity-60"
        >
          {resolved ? "✓ Resolved" : pending ? "Resolving…" : "Resolve →"}
        </button>
      </div>
      <p className="text-[11px] text-ink-400 italic leading-snug">
        Booking a session for {clientName.split(" ")[0] ?? clientName} closes
        this automatically.
      </p>
    </div>
  );
}
