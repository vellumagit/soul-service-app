"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { readingTypeLabel, readingTypeTone } from "@/lib/format";

type CalendarReading = {
  id: string;
  soulCode: string;
  soulName: string;
  type: string;
  status: string;
  scheduledAt: string;
  durationMinutes: number;
};

const HOUR_START = 8;
const HOUR_END = 21;
const PX_PER_HOUR = 48;
const SABBATH_DAY_OF_WEEK = 4; // Thursday

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekCalendar({
  weekStart,
  readings,
}: {
  weekStart: string;
  readings: CalendarReading[];
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

  // Group readings by day-of-week index
  const readingsByDay: CalendarReading[][] = Array.from({ length: 7 }, () => []);
  readings.forEach((r) => {
    const d = new Date(r.scheduledAt);
    const idx = Math.floor(
      (d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (idx >= 0 && idx < 7) readingsByDay[idx].push(r);
  });

  const totalMin = readings.reduce((s, r) => s + r.durationMinutes, 0);
  const souls = new Set(readings.map((r) => r.soulCode)).size;

  // "Now" line position
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;

  function shiftWeek(deltaDays: number) {
    const newStart = new Date(start);
    newStart.setDate(newStart.getDate() + deltaDays);
    router.push(`/calendar?start=${newStart.toISOString().slice(0, 10)}`);
  }

  return (
    <>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 tracking-tight">
            This week&apos;s readings
          </h1>
          <p className="text-xs text-ink-500 mt-0.5">
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
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center border border-ink-200 rounded">
            <button
              onClick={() => shiftWeek(-7)}
              className="px-2 py-1 hover:bg-ink-50 border-r border-ink-200"
            >
              ←
            </button>
            <button
              onClick={() => router.push("/calendar")}
              className="px-3 py-1 hover:bg-ink-50 border-r border-ink-200 font-medium"
            >
              Today
            </button>
            <button
              onClick={() => shiftWeek(7)}
              className="px-2 py-1 hover:bg-ink-50"
            >
              →
            </button>
          </div>
          <button className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded">
            Schedule reading
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-4 border border-ink-200 rounded-md overflow-hidden mb-4 bg-white">
        <Stat label="Readings booked" value={readings.length.toString()} />
        <Stat
          label="Hours holding"
          value={`${(totalMin / 60).toFixed(1)}h`}
          mono
        />
        <Stat label="Souls in care" value={souls.toString()} />
        <Stat
          label="First-time souls"
          value={readings
            .filter((r) => r.type === "first_reading_intake")
            .length.toString()}
          last
        />
      </div>

      {/* Modality legend */}
      <div className="flex items-center gap-4 mb-3 text-[11px] text-ink-500 flex-wrap">
        <Legend tone="flame" label="Soul reading" />
        <Legend tone="green" label="Heart clearing" />
        <Legend tone="purple" label="Ancestral reading" />
        <Legend tone="rose" label="Love alignment" />
        <Legend tone="blue" label="Inner child" />
        <Legend tone="amber" label="Intake" />
      </div>

      {/* Week grid */}
      <div className="border border-ink-200 rounded-md overflow-hidden bg-white">
        <div
          className="grid border-b border-ink-100 bg-ink-50/40"
          style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}
        >
          <div />
          {days.map((d, i) => {
            const isToday = i === todayDayIndex;
            const isSabbath = i === SABBATH_DAY_OF_WEEK;
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
                    <span
                      className={`text-sm ${
                        isSabbath ? "text-ink-400" : "text-ink-800"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  )}
                </div>
                {isSabbath && (
                  <div className="text-[9px] text-ink-400 mt-0.5 font-mono">
                    sabbath
                  </div>
                )}
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
            const isSabbath = dayIdx === SABBATH_DAY_OF_WEEK;
            return (
              <div
                key={dayIdx}
                className={`day-col relative ${
                  dayIdx < 6 ? "border-r border-ink-100" : ""
                } ${isToday ? "today" : ""} ${isSabbath ? "sabbath" : ""}`}
              >
                {isSabbath && (
                  <div className="sabbath-label">rest day</div>
                )}
                {readingsByDay[dayIdx].map((r) => {
                  const d = new Date(r.scheduledAt);
                  const startH = d.getHours() + d.getMinutes() / 60;
                  const top = (startH - HOUR_START) * PX_PER_HOUR;
                  const height =
                    (r.durationMinutes / 60) * PX_PER_HOUR - 4;
                  if (top < 0 || top > (HOUR_END - HOUR_START) * PX_PER_HOUR)
                    return null;
                  const tone = readingTypeTone(r.type);
                  const endMin = d.getMinutes() + r.durationMinutes;
                  const endD = new Date(d);
                  endD.setMinutes(endMin);
                  const fmt = (x: Date) =>
                    x.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    });
                  return (
                    <Link
                      key={r.id}
                      href={`/souls/${encodeURIComponent(r.soulCode)}`}
                      className={`cal-block tone-${tone}`}
                      style={{ top, height }}
                    >
                      <div className="t">
                        {fmt(d)}–{fmt(endD)}
                      </div>
                      <div className="n">{r.soulName}</div>
                      {height > 44 && (
                        <div className="m">{readingTypeLabel(r.type)}</div>
                      )}
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
      <p className="text-[11px] text-ink-400 mt-2">
        Hours shown 8am–9pm. Click a reading to open that soul&apos;s file.
        {readings.length === 0 &&
          " · Nothing booked this week — schedule one from any soul's file."}
      </p>
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

function Legend({ tone, label }: { tone: string; label: string }) {
  const colorMap: Record<string, string> = {
    flame: "bg-flame-100 border-flame-500",
    green: "bg-green-50 border-green-500",
    purple: "bg-purple-50 border-purple-500",
    rose: "bg-rose-50 border-rose-400",
    blue: "bg-blue-50 border-blue-500",
    amber: "bg-amber-50 border-amber-500",
  };
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-3 h-3 rounded-sm border-l-2 ${colorMap[tone]}`}
      />{" "}
      {label}
    </div>
  );
}
