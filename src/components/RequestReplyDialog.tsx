"use client";

// "Reply" on a request row — write back to the client without leaving the page.
//
// Purpose-built rather than reusing EmailComposer: that one needs the full
// client record plus her template list, which a request row doesn't carry.
// This is one job — answer a person asking for a time — so it opens with a
// draft already written, quoting what they asked for. She edits and sends.
//
// Sending also marks the request ACKNOWLEDGED, which is the point: it stays
// on her Requests page (still open work — nothing is booked yet) while the
// client's portal stops saying "waiting" and starts saying she's on it.

import { useState, useTransition } from "react";
import { Modal } from "./Modal";
import { replyToRequest } from "@/lib/actions";
import { notify } from "./FlashNotifier";

export function RequestReplyDialog({
  kind,
  requestId,
  clientName,
  clientEmail,
  practitionerFirstName,
  /** What they actually asked for — quoted back so the draft isn't generic. */
  askedFor,
}: {
  kind: "booking" | "reschedule";
  requestId: string;
  clientName: string;
  clientEmail: string | null;
  practitionerFirstName: string;
  askedFor?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const first = clientName.split(" ")[0] ?? clientName;

  const defaultSubject =
    kind === "booking"
      ? "About finding a time"
      : "About moving our session";
  const defaultBody =
    kind === "booking"
      ? `Hi ${first},\n\nThank you for reaching out — I'd love to find a time.\n${
          askedFor ? `\nYou mentioned: "${askedFor}"\n` : ""
        }\nWould one of these work?\n\n  · \n  · \n\nLet me know and I'll put it in the calendar.\n\nWarmly,\n${practitionerFirstName}`
      : `Hi ${first},\n\nOf course — let's find another time.\n${
          askedFor ? `\nYou mentioned: "${askedFor}"\n` : ""
        }\nWould one of these work?\n\n  · \n  · \n\nOnce you tell me, I'll move it and you'll get the new details.\n\nWarmly,\n${practitionerFirstName}`;

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  const canSend = !!clientEmail && clientEmail.includes("@");

  function send() {
    startTransition(async () => {
      const r = await replyToRequest({ kind, requestId, subject, body });
      if (!r.ok) {
        notify({ kind: "warning", title: "Couldn't send", body: r.error });
        return;
      }
      setOpen(false);
      notify({
        kind: r.suppressed ? "warning" : "success",
        title: r.suppressed ? "Not actually sent" : "Reply sent",
        body: r.suppressed
          ? `An email guard blocked the send to ${r.sentTo}. Nothing reached them.`
          : `Sent to ${r.sentTo}. ${first} now sees that you're on it.`,
        ttlMs: 5000,
      });
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canSend}
        title={
          canSend ? undefined : "This client has no email on file"
        }
        className="text-plum-700 hover:underline font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
      >
        Reply →
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Reply to ${first}`}
      >
        <div className="space-y-4">
          <p className="text-[12px] text-ink-500 italic leading-snug">
            Goes to {clientEmail}. Their reply comes back to you. Sending
            marks this request as answered — it stays on your list until a
            session is actually booked.
          </p>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Subject
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Message
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              maxLength={8000}
              className="mt-1.5 w-full px-3 py-2 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y font-sans"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={send}
              disabled={pending}
              className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 disabled:opacity-60 text-white rounded-md font-medium transition-colors"
            >
              {pending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="px-4 py-2 text-sm text-ink-600 hover:text-ink-900 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
