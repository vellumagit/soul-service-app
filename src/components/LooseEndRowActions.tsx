"use client";

// Per-row action button on the Requests page.
//
// Five flavors:
//   - showOutcomeInline → three one-tap answers to "Did this happen?":
//                         It happened / No-show / Didn't happen. Inline
//                         because the whole point of that section is that
//                         these sessions have been sitting unanswered —
//                         a trip to the session card is what didn't happen
//                         the first time.
//   - showMarkPaidInline→ the Mark paid dialog, opened in place.
//   - showReflectInline → button opens The Closing modal in place. Used
//                         for the "Waiting for a closing" section, the
//                         single most common loose-end and the one where
//                         inline-modal is meaningfully faster than
//                         navigating to the session card.
//   - showRetryBot      → button spawns a fresh Recall bot via
//                         addBotToSessionNow. Used when the existing
//                         bot's status is fatal but the meeting may
//                         still be salvageable.
//   - default           → plain Link to the session anchor on the
//                         client's Sessions tab, with the section's
//                         fallback label.

import Link from "next/link";
import { useState, useTransition } from "react";
import { ClosingRitualDialog } from "./ClosingRitualDialog";
import { MarkPaidDialog } from "./MarkPaidDialog";
import {
  addBotToSessionNow,
  cancelSession,
  markNoShow,
  markSessionHeld,
} from "@/lib/actions";
import { notify } from "./FlashNotifier";
import type { LooseEndRow } from "@/db/queries";

export function LooseEndRowActions({
  row,
  fallbackHref,
  fallbackLabel,
  showReflectInline,
  showRetryBot,
  showMarkPaidInline = false,
  showOutcomeInline = false,
}: {
  row: LooseEndRow;
  fallbackHref: string;
  fallbackLabel: string;
  showReflectInline: boolean;
  showRetryBot: boolean;
  showMarkPaidInline?: boolean;
  showOutcomeInline?: boolean;
}) {
  const [closingOpen, setClosingOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [retried, setRetried] = useState(false);
  const [settled, setSettled] = useState<string | null>(null);

  if (showOutcomeInline) {
    const firstName = row.clientName.split(" ")[0] ?? row.clientName;

    // The three honest answers to "did this happen?". "Held" is the common
    // one and reads as the primary; the other two are quiet text.
    const answer = (
      run: () => Promise<{ ok: true } | { ok: false; error: string }>,
      done: string,
      body: string
    ) =>
      startTransition(async () => {
        const r = await run();
        if (!r.ok) {
          notify({ kind: "warning", title: "That didn't save", body: r.error });
          return;
        }
        setSettled(done);
        notify({ kind: "success", title: done, body, ttlMs: 3500 });
      });

    if (settled) {
      return (
        <span className="text-xs text-ink-400 shrink-0 italic">✓ {settled}</span>
      );
    }

    return (
      <span className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() =>
            answer(
              async () => {
                const r = await markSessionHeld(row.sessionId, row.clientId);
                // Completion can auto-generate an invoice. If that part
                // failed the session IS still marked held, so don't report
                // it as a failure — say what didn't happen and move on.
                if (r.ok && r.invoiceError) {
                  notify({
                    kind: "warning",
                    title: "Marked held, but the invoice didn't generate",
                    body: r.invoiceError,
                  });
                }
                return r;
              },
              "Marked as held",
              `${firstName}'s session now counts — it'll show up under notes, the Closing and payments.`
            )
          }
          className="text-xs px-2.5 py-1 rounded-md border border-plum-200 bg-plum-50 text-plum-700 hover:bg-plum-100 font-medium disabled:opacity-50"
          title="This session went ahead"
        >
          It happened
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() =>
            answer(
              () => markNoShow(row.sessionId, row.clientId),
              "Marked as a no-show",
              `Kept on ${firstName}'s record. Still billable if that's your call.`
            )
          }
          className="text-xs text-ink-500 hover:text-ink-900 hover:underline disabled:opacity-50"
          title="They didn't turn up — keeps the record, still billable"
        >
          No-show
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() =>
            answer(
              async () => {
                // Quiet cancel: this session is already in the past, so an
                // "it's cancelled" email would reach the client long after
                // the fact and only confuse them.
                //
                // cancelSession THROWS on failure rather than returning a
                // result like its two neighbours, so it needs catching here —
                // an uncaught rejection inside startTransition would leave
                // the row looking like nothing happened.
                try {
                  await cancelSession(row.sessionId, row.clientId, {
                    notifyClient: false,
                  });
                  return { ok: true as const };
                } catch (err) {
                  return {
                    ok: false as const,
                    error:
                      err instanceof Error
                        ? err.message
                        : "Couldn't cancel that session.",
                  };
                }
              },
              "Cancelled",
              "Taken off the record. Nobody was emailed."
            )
          }
          className="text-xs text-ink-400 hover:text-red-700 hover:underline disabled:opacity-50"
          title="Cancel it — nobody is emailed"
        >
          Didn&apos;t happen
        </button>
      </span>
    );
  }

  if (showMarkPaidInline) {
    return <MarkPaidDialog sessionId={row.sessionId} clientId={row.clientId} />;
  }

  if (showReflectInline) {
    return (
      <>
        <button
          type="button"
          onClick={() => setClosingOpen(true)}
          className="text-xs text-plum-700 hover:underline font-medium shrink-0"
        >
          Reflect →
        </button>
        <ClosingRitualDialog
          open={closingOpen}
          onClose={() => setClosingOpen(false)}
          sessionId={row.sessionId}
          clientName={row.clientName}
          // No `initial` — by definition these sessions have never been
          // closed, so the modal opens with empty fields.
        />
      </>
    );
  }

  if (showRetryBot) {
    return (
      <button
        type="button"
        disabled={pending || retried} aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await addBotToSessionNow(row.sessionId);
            if (!r.ok) {
              notify({
                kind: "warning",
                title: "Couldn't send a new notetaker",
                body: r.error,
              });
            } else {
              setRetried(true);
              notify({
                kind: "success",
                title: "Notetaker is joining",
                body: `A fresh bot is on its way into ${row.clientName.split(" ")[0]}'s session.`,
                ttlMs: 3500,
              });
            }
          })
        }
        className="text-xs text-honey-700 hover:underline font-medium shrink-0 disabled:opacity-50"
        title="Spawn a fresh Recall.ai bot to join this Meet now"
      >
        {retried ? "✓ Sent" : pending ? "Sending…" : "Send a new one →"}
      </button>
    );
  }

  return (
    <Link
      href={fallbackHref}
      className="text-xs text-plum-700 hover:underline font-medium shrink-0"
    >
      {fallbackLabel}
    </Link>
  );
}
