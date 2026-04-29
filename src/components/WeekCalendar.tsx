"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { fullDate, shortTime, toneFor } from "@/lib/format";

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

const HOUR_START = 8;
const HOUR_END = 21;
const PX_PER_HOUR = 48;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekCalendar({
  weekStart,
  sessions,
}: {
  weekStart: string;
  sessions: CalSession[];
}) {
  const router = useRouter();
  const start = new Date(weekStart);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDayIndex =
    today >= start &&
    today < new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
      ? today.getDay()
      : -1;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  const sessionsByDay: CalSession[][] = Array.from({ length: 7 }, () => []);
  sessions.forEach((r) => {
    const d = new Date(r.scheduledAt);
    const idx = Math.floor(
      (d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (idx >= 0 && idx < 7) sessionsByDay[idx].push(r);
  });

  const totalMin = sessions.reduce((s, r) => s + r.durationMinutes, 0);
  const clients = new Set(sessions.map((r) => r.clientId)).size;
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;

  function shiftWeek(deltaDays: number) {
    const newStart = new Date(start);
    newStart.setDate(newStart.getDate() + deltaDays);
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
            {start.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            –{" "}
            {days[6].toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
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
        {days.map((d, i) => {
          const daySessions = sessionsByDay[i];
          if (daySessions.length === 0 && i !== todayDayIndex) return null;
          const isToday = i === todayDayIndex;
          return (
            <div key={i}>
              <div
                className={`text-xs uppercase tracking-wider mb-2 ${
                  isToday ? "text-flame-700 font-semibold" : "text-ink-500"
                }`}
              >
                {DAY_NAMES[i]} · {fullDate(d)}
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
                      href={`/clients/${s.clientId}`}
                      className="block border border-ink-200 rounded-md p-3 bg-white hover:bg-ink-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-flame-700 font-medium">
                          {shortTime(s.scheduledAt)}
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
          {days.map((d, i) => {
            const isToday = i === todayDayIndex;
            return (
              <div
                key={i}
                className="border-l border-ink-100 px-2 py-2 text-center"
              >
                <div
                  className={`text-[10px] uppercase tracking-wider ${
                    isToday ? "text-flame-700" : "text-ink-500"
                  }`}
                >
                  {DAY_NAMES[i]}
                </div>
                <div className="mt-0.5">
                  {isToday ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-flame-600 text-white text-xs font-semibold">
                      {d.getDate()}
                    </span>
                  ) : (
                    <span className="text-sm text-ink-800">{d.getDate()}</span>
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
          {days.map((_, dayIdx) => {
            const isToday = dayIdx === todayDayIndex;
            return (
              <div
                key={dayIdx}
                className={`day-col relative ${
                  dayIdx < 6 ? "border-r border-ink-100" : ""
                } ${isToday ? "today" : ""}`}
              >
                {sessionsByDay[dayIdx].map((s) => {
                  const d = new Date(s.scheduledAt);
                  const startH = d.getHours() + d.getMinutes() / 60;
                  const top = (startH - HOUR_START) * PX_PER_HOUR;
                  const height =
                    (s.durationMinutes / 60) * PX_PER_HOUR - 4;
                  if (top < 0 || top > (HOUR_END - HOUR_START) * PX_PER_HOUR)
                    return null;
                  const tone = toneFor(s.type);
                  const endMin = d.getMinutes() + s.durationMinutes;
                  const endD = new Date(d);
                  endD.setMinutes(endMin);
                  return (
                    <Link
                      key={s.id}
                      href={`/clients/${s.clientId}`}
                      className={`cal-block tone-${tone}`}
                      style={{ top, height }}
                    >
                      <div className="t">
                        {shortTime(d)}–{shortTime(endD)}
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
                      background: "var(--color-flame-600)",
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
                        background: "var(--color-flame-600)",
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
