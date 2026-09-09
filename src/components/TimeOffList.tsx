"use client";

// The time-off blocks she has set, with a way to remove one. Before this,
// a block could be created (Calendar → Time off…) but was drawn nowhere and
// could not be undone — a mistyped range silently blocked portal bookings
// for good. Removing a block re-opens those days for booking; sessions that
// were cancelled when it was applied stay cancelled (restore them from the
// client's Sessions tab).

import { deleteTimeOff } from "@/lib/actions";
import { ConfirmButton } from "./ConfirmButton";

export type TimeOffRow = {
  id: string;
  label: string; // pre-formatted range in the practice zone
  note: string | null;
  sessionsCancelled: number;
};

export function TimeOffList({ rows }: { rows: TimeOffRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-4 rounded-md border border-honey-100 bg-honey-50/60 px-3 py-2 text-xs text-ink-700">
      <div className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-1">
        Time off
      </div>
      <ul className="divide-y divide-honey-100">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-1.5 flex-wrap">
            <span>
              {r.label}
              {r.note && <span className="text-ink-500"> · {r.note}</span>}
              {r.sessionsCancelled > 0 && (
                <span className="text-ink-400">
                  {" "}· {r.sessionsCancelled} session{r.sessionsCancelled === 1 ? "" : "s"} cancelled
                </span>
              )}
            </span>
            <ConfirmButton
              label="Remove"
              className="text-[11px] text-ink-500 hover:text-red-700 shrink-0"
              message={`Remove this time off (${r.label})? Those days open up for booking again. Sessions that were cancelled when it was set stay cancelled — restore them from the client's Sessions tab if needed.`}
              confirmLabel="Yes, remove it"
              onConfirm={async () => {
                const res = await deleteTimeOff(r.id);
                if (!res.ok) throw new Error(res.error);
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
