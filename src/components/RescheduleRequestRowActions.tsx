"use client";

// Inline actions on a reschedule-request row in Requests.
//
//   Reply →            agree a new time in writing. Marks the request
//                      ANSWERED, which is what the client's portal reads to
//                      stop saying "waiting" and start saying she's on it.
//   Text / Call        only when there's a phone. Tap-to-text links that open
//                      her own apps — this app has no SMS sending.
//   Open the session → rescheduling it there closes this request
//                      automatically (rescheduleSession resolves it), so the
//                      loop finishes without her coming back here.
//   Resolve →          manual escape hatch when it's settled some other way.
//
// The comment that used to live here said we DON'T auto-resolve on
// reschedule "because she may have just dismissed without action". That
// stopped being true when rescheduleSession started resolving these — moving
// the session genuinely does answer the question.

import Link from "next/link";
import { useState, useTransition } from "react";
import { resolveRescheduleRequest } from "@/lib/actions";
import { notify } from "./FlashNotifier";
import { RequestReplyDialog } from "./RequestReplyDialog";

export function RescheduleRequestRowActions({
  requestId,
  clientId,
  sessionId,
  clientName,
  clientEmail,
  clientPhone,
  practitionerFirstName,
  askedFor,
  status,
}: {
  requestId: string;
  clientId: string;
  sessionId: string;
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
          ◇ You&apos;ve replied — waiting on a new time
        </p>
      )}
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <RequestReplyDialog
          kind="reschedule"
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
          href={`/clients/${clientId}?tab=sessions#${sessionId}`}
          className="text-plum-700 hover:underline font-medium"
        >
          Move the session →
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
        Rescheduling the session closes this automatically.
      </p>
    </div>
  );
}
