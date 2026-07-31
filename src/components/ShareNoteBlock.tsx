"use client";

// "Leave them a note" on a completed session.
//
// This is the missing writer for sessions.client_visible_note. The portal has
// read that column since it shipped — it's what powers the honey-tinted
// "Since your last session" card on a client's home — but nothing in the app
// ever wrote it, so that card could never appear for anybody.
//
// Deliberately separate from her private session notes, and labelled so the
// difference is impossible to miss: everything else she types about a session
// is hers alone; this one thing the client reads.

import { useState, useTransition } from "react";
import { shareSessionNote } from "@/lib/actions";
import { notify } from "./FlashNotifier";

export function ShareNoteBlock({
  sessionId,
  clientFirstName,
  initial,
  portalEnabled,
}: {
  sessionId: string;
  clientFirstName: string;
  initial: string | null;
  /** No portal, no reader — say so rather than implying they'll see it. */
  portalEnabled: boolean;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== (initial ?? "").trim();

  return (
    <div className="border-t border-ink-100 pt-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1.5">
        <p className="text-xs text-ink-500">
          For {clientFirstName} to read
        </p>
        {!portalEnabled && (
          <p className="text-[11px] text-honey-700 italic">
            They don&apos;t have a portal yet — open one on their profile.
          </p>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={3}
        maxLength={2000}
        placeholder={`Something for ${clientFirstName} to carry until next time…`}
        className="w-full px-3 py-2 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y"
      />
      <div className="flex items-center gap-3 mt-1.5">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              const r = await shareSessionNote(sessionId, value);
              if (!r.ok) {
                notify({
                  kind: "warning",
                  title: "Couldn't save",
                  body: r.error,
                });
                return;
              }
              setSaved(true);
              notify({
                kind: "success",
                title: "Shared",
                body: r.notified
                  ? `${clientFirstName} has been emailed that it's there.`
                  : "Saved to their space.",
                ttlMs: 3500,
              });
            })
          }
          className="px-3 py-1.5 text-xs bg-plum-700 hover:bg-plum-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
        >
          {pending ? "Saving…" : saved ? "✓ Shared" : "Share with them"}
        </button>
        <p className="text-[11px] text-ink-400 italic">
          Appears on their portal. Everything else you write stays private.
        </p>
      </div>
    </div>
  );
}
