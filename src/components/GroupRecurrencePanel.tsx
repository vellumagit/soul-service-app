"use client";

// "Weekly rhythm" panel on a group's detail page. Turns on automatic weekly
// scheduling so the storefront always has the next few weeks of open seats —
// the "fill seats as a lead engine" workflow. Submits to setGroupRecurrence,
// which saves the config and immediately generates the upcoming sessions.

import { useState } from "react";
import { setGroupRecurrence } from "@/lib/group-actions";

const WEEKDAYS = [
  { v: 0, label: "Sunday" },
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" },
];

export function GroupRecurrencePanel({
  groupId,
  enabled,
  weekday,
  time,
}: {
  groupId: string;
  enabled: boolean;
  weekday: number | null;
  time: string | null;
}) {
  const [on, setOn] = useState(enabled);

  return (
    <form
      action={setGroupRecurrence}
      className="paper-card p-4 mb-7 max-w-2xl"
    >
      <input type="hidden" name="id" value={groupId} />

      <div className="text-[10px] uppercase tracking-wider font-mono text-ink-500 mb-2">
        Weekly rhythm
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          name="recurrenceEnabled"
          value="true"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="rounded border-ink-300 mt-0.5"
        />
        <span className="text-sm text-ink-700 leading-snug">
          Automatically schedule this Circle every week
          <span className="block text-[11px] text-ink-500 italic mt-0.5">
            Keeps the next 4 weeks filled on your storefront so there&apos;s
            always a seat to book — no manual scheduling.
          </span>
        </span>
      </label>

      {on && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Day
            </span>
            <select
              name="recurrenceWeekday"
              defaultValue={weekday ?? 2}
              className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
            >
              {WEEKDAYS.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Time
            </span>
            <input
              type="time"
              name="recurrenceTime"
              defaultValue={time ?? "19:00"}
              className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>
        </div>
      )}

      <p className="text-[11px] text-ink-500 italic mt-3">
        Times are in your practice timezone (Settings → Your business). Sessions
        use this group&apos;s default capacity, duration, and price; the welcome
        email uses your standing Circle room link.
      </p>

      <div className="flex items-center justify-end gap-2 pt-3">
        <button
          type="submit"
          className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium"
        >
          Save rhythm
        </button>
      </div>
    </form>
  );
}
