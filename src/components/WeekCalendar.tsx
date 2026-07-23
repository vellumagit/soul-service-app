"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { fullDate, shortDate, shortTime, zoneAbbrev, toneFor } from "@/lib/format";
import { zonedClock, zonedDateKey } from "@/lib/timezone";
import { useTimeZone } from "./TimeZoneProvider";

type CalSession = {
  id: string;
  clientId: string;
  /** Where clicking goes. Circles point at /groups/[id], not a client. */
  href?: string;
  clientName: string;
  type: string;
  status: string;
  scheduledAt: string;
  durationMinutes: number;
  paid: boolean;
};

const HOUR_START = 8;
const HOUR_END = 21;
const PX_PER_HOUR = 48;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Column index (0=Sun … 6=Sat) → ISO weekday name (lowercase), matching the
// strings stored in practitioner_settings.sabbath_days.
const WEEKDAY_NAME = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function WeekCalendar({
  weekStart,
  sessions,
  sabbathDays = [],
}: {
  weekStart: string;
  sessions: CalSession[];
  /** Lowercase ISO weekday names she's marked as sacred-off. Empty = none. */
  sabbathDays?: string[];
}) {
  const router = useRouter();
  // Everything below is computed in HER practice timezone, so a block lands in
  // the right row/column no matter what zone the browser is in (Svit in
  // Edmonton, Brian in Brazil — identical view).
  const tz = useTimeZone();

  // The 7 day columns as pure "YYYY-MM-DD" calendar dates, built from the
  // week's Sunday. Viewer- and server-tz independent (plain date arithmetic).
  const [wy, wm, wd] = weekStart.slice(0, 10).split("-").map(Number);
  const dayKeys = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(wy, wm - 1, wd + i)).toISOString().slice(0, 10)
  );
  // A safe midday-UTC anchor per column for date labels (never rolls to an
  // adjacent day when formatted in UTC).
  const dayDates = dayKeys.map((k) => new Date(`${k}T12:00:00Z`));

  const todayKey = zonedDateKey(new Date(), tz);
  const todayDayIndex = dayKeys.indexOf(todayKey);

  const sabbathSet = new Set(sabbathDays.map((d) => d.toLowerCase()));
  const isSabbathCol = (i: number) => sabbathSet.has(WEEKDAY_NAME[i]);

  const sessionsByDay: CalSession[][] = Array.from({ length: 7 }, () => []);
  sessions.forEach((r) => {
    const idx = dayKeys.indexOf(zonedDateKey(new Date(r.scheduledAt), tz));
    if (idx >= 0) sessionsByDay[idx].push(r);
  });

  const totalMin = sessions.reduce((s, r) => s + r.durationMinutes, 0);
  // Circles carry a groupId in clientId (they have no client), so exclude them
  // — otherwise a Circle would count as a "client" in this stat.
  const clients = new Set(
    sessions.filter((r) => !r.href).map((r) => r.clientId)
  ).size;
  const nowClock = zonedClock(new Date(), tz);
  const nowHour = nowClock.hour + nowClock.minute / 60;
  const zoneLabel = zoneAbbrev(new Date(), tz);

  function shiftWeek(deltaDays: number) {
    const newStart = new Date(Date.UTC(wy, wm - 1, wd + deltaDays));
    router.push(`/calendar?start=${newStart.toISOString().slice(0, 10)}`);
  }

  return (
    <>
      <div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
            This week
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            {shortDate(dayDates[0], "UTC")} – {fullDate(dayDates[6], "UTC")}
            {zoneLabel && (
              <span className="text-ink-400">
                {" "}
                · all times {zoneLabel}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center border border-ink-200 rounded-md bg-white">
            <button
              onClick={() => shiftWeek(-7)}
              className="px-3 py-1.5 hover:bg-ink-50 border-r border-ink-200"
              aria-label="Previous week"
            >
              ←
            </button>
            <button
              onClick={() => router.push("/calendar")}
              className="px-3 py-1.5 hover:bg-ink-50 border-r border-ink-200 font-medium text-xs"
            >
              Today
            </button>
            <button
              onClick={() => shiftWeek(7)}
              className="px-3 py-1.5 hover:bg-ink-50"
              aria-label="Next week"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 border border-ink-200 rounded-md overflow-hidden mb-5 bg-white">
        <Stat label="Sessions booked" value={sessions.length.toString()} />
        <Stat
          label="Hours"
          value={`${(totalMin / 60).toFixed(1)}h`}
          mono
        />
        <Stat label="Clients" value={clients.toString()} last />
      </div>

      {/* Mobile: list view */}
      <div className="md:hidden space-y-4">
        {dayDates.map((d, i) => {
          const daySessions = sessionsByDay[i];
          if (daySessions.length === 0 && i !== todayDayIndex) return null;
          const isToday = i === todayDayIndex;
          return (
            <div key={i}>
              <div
                className={`text-xs uppercase tracking-wider mb-2 ${
                  isToday ? "text-plum-700 font-semibold" : "text-ink-500"
                }`}
              >
                {DAY_NAMES[i]} · {fullDate(d, "UTC")}
                {isToday && " · today"}
              </div>
              {daySessions.length === 0 ? (
                <div className="text-xs text-ink-400 italic">
                  Nothing scheduled.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {daySessions.map((s) => (
                    <Link
                      key={s.id}
                      href={s.href ?? `/clients/${s.clientId}`}
                      className="block border border-ink-200 rounded-md p-3 bg-white hover:bg-ink-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-plum-700 font-medium">
                          {shortTime(s.scheduledAt, tz)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-ink-900 truncate">
                            {s.clientName}
                          </div>
                          <div className="text-xs text-ink-500">
                            {s.type} · {s.durationMinutes}m
                          </div>
                        </div>
                        {s.status === "completed" && (
                          <span
                            className={`chip shrink-0 ${
                              s.paid
                                ? "bg-green-50 text-green-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {s.paid ? "PAID" : "UNPAID"}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: week grid */}
      <div className="hidden md:block border border-ink-200 rounded-md overflow-hidden bg-white">
        <div
          className="grid border-b border-ink-100 bg-ink-50/40"
          style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}
        >
          <div />
          {dayKeys.map((key, i) => {
            const isToday = i === todayDayIndex;
            const dayNum = Number(key.slice(8, 10));
            return (
              <div
                key={i}
                className="border-l border-ink-100 px-2 py-2 text-center"
              >
                <div
                  className={`text-[10px] uppercase tracking-wider ${
                    isToday ? "text-plum-700" : "text-ink-500"
                  }`}
                >
                  {DAY_NAMES[i]}
                </div>
                <div className="mt-0.5">
                  {isToday ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-plum-600 text-white text-xs font-semibold">
                      {dayNum}
                    </span>
                  ) : (
                    <span className="text-sm text-ink-800">{dayNum}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="grid relative"
          style={{
            gridTemplateColumns: "56px repeat(7, 1fr)",
            height: `${(HOUR_END - HOUR_START) * PX_PER_HOUR}px`,
          }}
        >
          {/* Time labels */}
          <div className="relative border-r border-ink-100">
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => {
              const h = HOUR_START + i;
              const label =
                h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`;
              return (
                <div
                  key={h}
                  style={{
                    position: "absolute",
                    top: i * PX_PER_HOUR,
                    right: 6,
                    fontSize: 10,
                    color: "var(--color-ink-400)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {dayKeys.map((key, dayIdx) => {
            const isToday = dayIdx === todayDayIndex;
            const isOff = isSabbathCol(dayIdx);
            return (
              <div
                key={dayIdx}
                className={`day-col relative ${
                  dayIdx < 6 ? "border-r border-ink-100" : ""
                } ${isToday ? "today" : ""} ${isOff ? "sabbath" : ""}`}
              >
                {/* Small "off" label centered in sabbath columns, behind any
                    sessions. The CSS positions it absolutely and rotates
                    slightly so it reads as a quiet annotation, not a heading. */}
                {isOff && <span className="sabbath-label">Off</span>}
                {sessionsByDay[dayIdx].map((s) => {
                  // Position by HER local clock, not the browser's.
                  const startInstant = new Date(s.scheduledAt);
                  const { hour, minute } = zonedClock(startInstant, tz);
                  const startH = hour + minute / 60;
                  const top = (startH - HOUR_START) * PX_PER_HOUR;
                  const height =
                    (s.durationMinutes / 60) * PX_PER_HOUR - 4;
                  if (top < 0 || top > (HOUR_END - HOUR_START) * PX_PER_HOUR)
                    return null;
                  const tone = toneFor(s.type);
                  const endInstant = new Date(
                    startInstant.getTime() + s.durationMinutes * 60000
                  );
                  return (
                    <Link
                      key={s.id}
                      href={s.href ?? `/clients/${s.clientId}`}
                      className={`cal-block tone-${tone}`}
                      style={{ top, height }}
                    >
                      <div className="t">
                        {shortTime(startInstant, tz)}–{shortTime(endInstant, tz)}
                      </div>
                      <div className="n">{s.clientName}</div>
                      {height > 44 && <div className="m">{s.type}</div>}
                    </Link>
                  );
                })}
                {isToday && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: (nowHour - HOUR_START) * PX_PER_HOUR,
                      height: 1,
                      background: "var(--color-plum-600)",
                      zIndex: 3,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: -4,
                        top: -4,
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: "var(--color-plum-600)",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${last ? "" : "border-r border-ink-100"}`}>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-lg font-semibold text-ink-900 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
