"use client";

// Sabbath day picker — a row of seven small toggles, one per weekday, so she
// can mark which days are sacred-off. Empty = the app makes no assumption
// (she works all days). When set, the calendar shades those columns and the
// Schedule dialog shows a gentle "this is your Saturday off" hint.
//
// Lives inside the main Settings form. Updates a hidden `sabbathDays` field
// (comma-separated) that updateSettings reads.

import { useState } from "react";

const DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

export function SabbathDayPicker({ initial }: { initial: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial.map((d) => d.toLowerCase()))
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hiddenValue = DAYS
    .map((d) => d.key)
    .filter((k) => selected.has(k))
    .join(",");

  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-sm font-medium text-ink-900">Sabbath days</div>
        <div className="text-[11px] text-ink-400 italic">
          {selected.size === 0
            ? "You work all days"
            : `${selected.size} day${selected.size === 1 ? "" : "s"} marked off`}
        </div>
      </div>
      <p className="text-xs text-ink-500 leading-relaxed mb-3">
        Days you keep for yourself. Calendar shades them softly, scheduling
        respects them with a gentle reminder. No reminders go out on these
        days. Optional — leave all unchecked to work any day.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((d) => {
          const on = selected.has(d.key);
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => toggle(d.key)}
              aria-pressed={on}
              className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                on
                  ? "bg-plum-600 text-white border-plum-700 hover:bg-plum-700"
                  : "bg-white text-ink-600 border-ink-200 hover:bg-ink-50 hover:text-ink-900"
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <input type="hidden" name="sabbathDays" value={hiddenValue} />
    </div>
  );
}
