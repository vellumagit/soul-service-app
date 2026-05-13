"use client";

import Link from "next/link";
import { shortTime, toneFor } from "@/lib/format";

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
export function MonthCalendar({
  monthStart,
  sessions,
}: {
  /** ISO of the first day of the month being viewed, at 00:00 local. */
  monthStart: string;
  sessions: CalSession[];
}) {
  const anchor = new Date(monthStart);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // First cell = the Sunday on/before the 1st of the month.
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  // 6 rows × 7 cols = always 42 cells. Some months need 5 rows; the 6th row
  // ends up empty/dimmed. Trade-off for a stable grid height.
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  // Bucket sessions by YYYY-MM-DD for quick lookup
  const buckets: Record<string, CalSession[]> = {};
  for (const s of sessions) {
    const d = new Date(s.scheduledAt);
    const key = ymd(d);
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
      <div className="grid grid-cols-7 border-b border-ink-100 text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/50">
        {DAY_NAMES.map((n) => (
          <div key={n} className="px-2 py-2 text-center font-medium">
            {n}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const isToday = d.getTime() === today.getTime();
          const isPast = d < today;
          const key = ymd(d);
          const daySessions = buckets[key] ?? [];
          const visible = daySessions.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = daySessions.length - visible.length;

          // Link the empty area of the cell to the week view containing this day
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          const weekHref = `/calendar?view=week&start=${weekStart.toISOString()}`;

          return (
            <div
              key={i}
              className={[
                "min-h-[96px] border-r border-b border-ink-100 last:border-r-0 p-1.5 flex flex-col gap-1 relative group",
                inMonth ? "bg-white" : "bg-ink-50/40",
                i % 7 === 6 ? "border-r-0" : "",
                i >= 35 ? "border-b-0" : "",
                isToday ? "ring-2 ring-flame-500 ring-inset" : "",
              ].join(" ")}
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
                    isToday ? "text-flame-700 font-semibold" : "",
                  ].join(" ")}
                >
                  {d.getDate()}
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
                    title={`${s.clientName} · ${s.type} · ${shortTime(s.scheduledAt)}`}
                  >
                    <span className="font-mono text-[9px] opacity-70">
                      {shortTime(s.scheduledAt)}
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

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}
