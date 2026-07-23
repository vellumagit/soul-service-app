"use client";

import Link from "next/link";
import { shortTime, zoneAbbrev, toneFor } from "@/lib/format";
import { zonedDateKey } from "@/lib/timezone";
import { useTimeZone } from "./TimeZoneProvider";

type CalSession = {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  status: string;
  scheduledAt: string;
  durationMinutes: number;
  paid: boolean;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

/**
 * Month grid. Renders the 6 weeks that fully contain the given month —
 * leading + trailing days from neighboring months are dimmed so the
 * grid stays rectangular.
 *
 * Click a session chip → opens that session on the client's profile.
 * Click an empty day → opens the week view anchored to that week.
 */
const WEEKDAY_NAME = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function MonthCalendar({
  monthStart,
  sessions,
  sabbathDays = [],
}: {
  /** ISO of the first day of the month being viewed, at 00:00 local. */
  monthStart: string;
  sessions: CalSession[];
  /** Lowercase ISO weekday names she's marked as sacred-off. */
  sabbathDays?: string[];
}) {
  // All grid math runs on pure calendar dates (UTC arithmetic) and all session
  // bucketing runs in HER practice timezone — so the month reads identically
  // whether the browser is in Edmonton or Brazil.
  const tz = useTimeZone();
  const sabbathSet = new Set(sabbathDays.map((d) => d.toLowerCase()));

  // Month identity from the date string, NOT browser-local Date (a UTC-midnight
  // ISO parsed in a behind-UTC browser would report the previous month).
  const [year, mm] = monthStart.slice(0, 10).split("-").map(Number);
  const month = mm - 1; // 0-based

  const todayKey = zonedDateKey(new Date(), tz);
  const zoneLabel = zoneAbbrev(new Date(), tz);

  // First cell = the Sunday on/before the 1st. getUTCDay() of a pure-date
  // instant gives the true weekday for that calendar date.
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();

  // 6 rows × 7 cols = always 42 cells, as UTC calendar dates.
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(Date.UTC(year, month, 1 - firstDow + i)));
  }

  // Bucket sessions by HER-local YYYY-MM-DD for quick lookup
  const buckets: Record<string, CalSession[]> = {};
  for (const s of sessions) {
    const key = zonedDateKey(new Date(s.scheduledAt), tz);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(s);
  }
  // Sort sessions within each day by time
  for (const key of Object.keys(buckets)) {
    buckets[key].sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }

  return (
    <div className="border border-ink-200 rounded-md bg-white overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-ink-100 text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/50 relative">
        {DAY_NAMES.map((n) => (
          <div key={n} className="px-2 py-2 text-center font-medium">
            {n}
          </div>
        ))}
        {zoneLabel && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-ink-400 normal-case tracking-normal hidden sm:block">
            times in {zoneLabel}
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const key = d.toISOString().slice(0, 10);
          const inMonth = d.getUTCMonth() === month;
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const daySessions = buckets[key] ?? [];
          const visible = daySessions.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = daySessions.length - visible.length;

          // Link the empty area of the cell to the week view containing this day
          const weekStart = new Date(
            Date.UTC(
              d.getUTCFullYear(),
              d.getUTCMonth(),
              d.getUTCDate() - d.getUTCDay()
            )
          );
          const weekHref = `/calendar?view=week&start=${weekStart.toISOString()}`;

          const off = sabbathSet.has(WEEKDAY_NAME[d.getUTCDay()]);
          return (
            <div
              key={i}
              className={[
                "min-h-[96px] border-r border-b border-ink-100 last:border-r-0 p-1.5 flex flex-col gap-1 relative group",
                inMonth
                  ? off
                    ? "bg-ink-50"
                    : "bg-white"
                  : "bg-ink-50/40",
                i % 7 === 6 ? "border-r-0" : "",
                i >= 35 ? "border-b-0" : "",
                isToday ? "ring-2 ring-plum-500 ring-inset" : "",
              ].join(" ")}
              style={
                off && inMonth
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(135deg, transparent 0 8px, var(--color-ink-100) 8px 9px)",
                    }
                  : undefined
              }
            >
              {/* Date number — links to that week */}
              <Link
                href={weekHref}
                className="flex items-center justify-between"
              >
                <span
                  className={[
                    "text-[11px] font-mono",
                    inMonth ? "text-ink-700" : "text-ink-300",
                    isToday ? "text-plum-700 font-semibold" : "",
                  ].join(" ")}
                >
                  {d.getUTCDate()}
                </span>
                {daySessions.length > 0 && (
                  <span className="text-[9px] text-ink-400 font-mono">
                    {daySessions.length}
                  </span>
                )}
              </Link>

              {/* Session chips */}
              {visible.map((s) => {
                const tone = toneFor(s.type);
                const cancelled = s.status === "cancelled";
                return (
                  <Link
                    key={s.id}
                    href={`/clients/${s.clientId}#${s.id}`}
                    className={[
                      "block px-1.5 py-0.5 rounded text-[10px] leading-tight truncate hover:translate-x-px transition",
                      `tone-${tone}`,
                      cancelled ? "opacity-50 line-through" : "",
                      isPast && !cancelled ? "opacity-75" : "",
                    ].join(" ")}
                    title={`${s.clientName} · ${s.type} · ${shortTime(s.scheduledAt, tz)}`}
                  >
                    <span className="font-mono text-[9px] opacity-70">
                      {shortTime(s.scheduledAt, tz)}
                    </span>{" "}
                    <span className="font-medium">{s.clientName}</span>
                  </Link>
                );
              })}

              {overflow > 0 && (
                <Link
                  href={weekHref}
                  className="text-[10px] text-ink-500 hover:text-ink-900 px-1.5"
                >
                  +{overflow} more
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
