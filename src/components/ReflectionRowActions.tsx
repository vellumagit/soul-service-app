"use client";

// Actions on an unread reflection in /requests → "Something they wrote".
//
// Deliberately only two: open their file (where the full text lives and where
// the rest of their arc is for context), and mark it seen. A reflection isn't
// a request — there's nothing to approve, decline or schedule — so inventing
// a third action would imply a decision she doesn't actually have to make.

import Link from "next/link";
import { useState, useTransition } from "react";
import { markReflectionRead } from "@/lib/actions";
import { notify } from "./FlashNotifier";
import { bumpCounts } from "@/lib/counts-event";

export function ReflectionRowActions({
  reflectionId,
  clientId,
  truncated,
}: {
  reflectionId: string;
  clientId: string;
  /** Excerpted in the row, so the link is the only way to the whole thing. */
  truncated: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [read, setRead] = useState(false);

  if (read) {
    return (
      <span className="text-xs text-ink-400 italic">✓ Marked as read</span>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs flex-wrap">
      <Link
        href={`/clients/${clientId}?tab=reflections`}
        className="text-plum-700 hover:underline font-medium"
      >
        {truncated ? "Read all of it →" : "Open their file →"}
      </Link>
      <span className="text-ink-300">·</span>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await markReflectionRead(reflectionId);
            if (!r.ok) {
              notify({
                kind: "warning",
                title: "Couldn't mark that as read",
                body: r.error,
              });
              return;
            }
            setRead(true);
            bumpCounts();
          })
        }
        className="text-ink-500 hover:text-ink-900 hover:underline font-medium disabled:opacity-50"
      >
        {pending ? "Marking…" : "Mark as read"}
      </button>
    </div>
  );
}
