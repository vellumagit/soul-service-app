"use client";

// Availability config panel for /settings. Four controls:
//
//   1. Working hours: per-weekday on/off + from / to HH:MM
//   2. Buffer minutes between sessions
//   3. Default session length
//   4. Toggle: show available windows on the public inquiry form
//
// Serializes working hours into a hidden JSON field so the existing
// updateSettings server action picks it up cleanly. Toggles and number
// inputs render as standard form fields the action reads directly.
//
// Keeps the contemplative voice: no aggressive defaults — Svit fills in
// the days she actually wants visible to the scheduling logic. An "off"
// day means she's NOT available that day at all (sabbath days override
// this too, but working_hours is the primary signal).

import { useMemo, useState } from "react";

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];
type DayHours = { from: string; to: string };
type WorkingHours = Partial<Record<DayKey, DayHours | null>>;

export function AvailabilityPanel({
  initialWorkingHours,
  initialBufferMinutes,
  initialDefaultSessionMinutes,
  initialShowAvailabilityPublicly,
}: {
  initialWorkingHours: WorkingHours | null;
  initialBufferMinutes: number;
  initialDefaultSessionMinutes: number;
  initialShowAvailabilityPublicly: boolean;
}) {
  const [hours, setHours] = useState<WorkingHours>(
    initialWorkingHours ?? {}
  );

  const hoursJson = useMemo(() => JSON.stringify(hours), [hours]);

  function setDayOn(day: DayKey, on: boolean) {
    setHours((prev) => ({
      ...prev,
      [day]: on ? prev[day] ?? { from: "09:00", to: "17:00" } : null,
    }));
  }
  function setDayTime(day: DayKey, field: "from" | "to", value: string) {
    setHours((prev) => {
      const cur = prev[day] ?? { from: "09:00", to: "17:00" };
      return { ...prev, [day]: { ...cur, [field]: value } };
    });
  }

  return (
    <div className="border-t border-ink-100 pt-5 mt-2">
      <div className="mb-3">
        <h3
          className="serif-italic text-base text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Availability
        </h3>
        <p className="text-[12px] text-ink-500 italic leading-snug mt-1">
          When you&apos;re working. Drives the conflict warnings in the
          Schedule dialog and (optionally) the &ldquo;available windows&rdquo;
          hint on your storefront inquiry form.
        </p>
      </div>

      <input type="hidden" name="workingHours" value={hoursJson} />

      {/* Per-day grid */}
      <div className="space-y-2">
        {DAYS.map((d) => {
          const cur = hours[d.key];
          const on = !!cur;
          return (
            <div
              key={d.key}
              className="flex items-center gap-3 flex-wrap text-sm"
            >
              <label className="inline-flex items-center gap-2 min-w-[80px]">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setDayOn(d.key, e.target.checked)}
                  className="rounded border-ink-300"
                />
                <span className="text-ink-700">{d.label}</span>
              </label>
              {on && (
                <>
                  <input
                    type="time"
                    value={cur?.from ?? "09:00"}
                    onChange={(e) =>
                      setDayTime(d.key, "from", e.target.value)
                    }
                    className="px-2 py-1 text-sm border border-ink-200 rounded-md bg-white"
                  />
                  <span className="text-ink-400 text-xs">to</span>
                  <input
                    type="time"
                    value={cur?.to ?? "17:00"}
                    onChange={(e) =>
                      setDayTime(d.key, "to", e.target.value)
                    }
                    className="px-2 py-1 text-sm border border-ink-200 rounded-md bg-white"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Buffer + default duration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
            Buffer between sessions
          </span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              name="bufferMinutes"
              defaultValue={initialBufferMinutes}
              min={0}
              max={240}
              step={5}
              className="w-24 px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
            />
            <span className="text-[12px] text-ink-500 italic">minutes</span>
          </div>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
            Default session length
          </span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              name="defaultSessionMinutes"
              defaultValue={initialDefaultSessionMinutes}
              min={15}
              max={480}
              step={15}
              className="w-24 px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
            />
            <span className="text-[12px] text-ink-500 italic">minutes</span>
          </div>
        </label>
      </div>

      {/* Public availability toggle */}
      <label className="flex items-start gap-2.5 mt-5 cursor-pointer">
        <input
          type="checkbox"
          name="showAvailabilityPublicly"
          value="true"
          defaultChecked={initialShowAvailabilityPublicly}
          className="rounded border-ink-300 mt-0.5"
        />
        <span className="text-sm text-ink-700 leading-snug">
          Show available windows on my landing-page inquiry form.
          <span className="block text-[11px] text-ink-500 italic mt-0.5">
            Visitors see ~6 chips like &ldquo;Tue, Mar 18, 4:00pm&rdquo; they
            can tap to attach to their note. Not a self-serve booking — you
            still reach out to confirm.
          </span>
        </span>
      </label>
    </div>
  );
}
