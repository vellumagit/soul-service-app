"use client";

// Per-row action button on the Loose Ends page.
//
// Three flavors:
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
import { addBotToSessionNow } from "@/lib/actions";
import { notify } from "./FlashNotifier";
import type { LooseEndRow } from "@/db/queries";

export function LooseEndRowActions({
  row,
  fallbackHref,
  fallbackLabel,
  showReflectInline,
  showRetryBot,
}: {
  row: LooseEndRow;
  fallbackHref: string;
  fallbackLabel: string;
  showReflectInline: boolean;
  showRetryBot: boolean;
}) {
  const [closingOpen, setClosingOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [retried, setRetried] = useState(false);

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
        disabled={pending || retried}
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
