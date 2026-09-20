"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { fullDate, shortDate, shortTime, zoneAbbrev, toneFor } from "@/lib/format";
import { zonedClock, zonedDateKey } from "@/lib/timezone";
import { useTimeZone } from "./TimeZoneProvider";
import { WalkInButton } from "./WalkInButton";
import { JoinMeetButton } from "./JoinMeetButton";

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
  /** Resolved meeting link, if there is one. Lets a block be a doorway
   *  instead of a signpost pointing at the client file. */
  meetUrl?: string | null;
};

/** Where a block's click lands: the session's own row on the client file,
 *  not the bare profile. Circles carry their own `href` (a group has no
 *  client) and are left alone. */
function sessionHref(s: CalSession) {
  return s.href ?? `/clients/${s.clientId}?tab=sessions#${s.id}`;
}

/** A Circle has no client and no Threshold view — `href` is the marker.
 *  Only a real, still-upcoming 1-on-1 gets a "Walk in". */
function canWalkIn(s: CalSession) {
  return !s.href && s.status === "scheduled";
}

// Default visible window. The grid widens when a session falls outside it
// (a 7:30am or 9:30pm booking used to render nothing while the header
// still counted it).
const DEFAULT_HOUR_START = 8;
const DEFAULT_HOUR_END = 21;
const PX_PER_HOUR = 48;

// Lay overlapping sessions out side by side instead of stacking them on top
// of each other — stacking hid every session but the front one (eleven 9:00
// bookings looked like one). Classic interval-lane packing per day column:
// sort by start, group transitively-overlapping sessions into a cluster,
// give each the first free lane; every block in a cluster shares its width.
function layoutLanes(
  day: CalSession[],
  tz: string
): Map<string, { lane: number; lanes: number }> {
  const out = new Map<string, { lane: number; lanes: number }>();
  const items = day
    .map((s) => {
      const { hour, minute } = zonedClock(new Date(s.scheduledAt), tz);
      const start = hour * 60 + minute;
      return { id: s.id, start, end: start + Math.max(s.durationMinutes, 1) };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster: typeof items = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const it of cluster) {
      out.set(it.id, { lane: out.get(it.id)!.lane, lanes: laneEnds.length });
    }
    cluster = [];
    laneEnds = [];
  };
  for (const it of items) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    clusterEnd = cluster.length === 0 ? it.end : Math.max(clusterEnd, it.end);
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    out.set(it.id, { lane, lanes: 1 });
    cluster.push(it);
  }
  flush();
  return out;
}
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

  // Visible hours: the default window, stretched to cover every session in
  // this week so nothing is drawn off the grid.
  let hourStart = DEFAULT_HOUR_START;
  let hourEnd = DEFAULT_HOUR_END;
  for (const s of sessions) {
    const { hour, minute } = zonedClock(new Date(s.scheduledAt), tz);
    const startH = hour + minute / 60;
    const endH = startH + s.durationMinutes / 60;
    hourStart = Math.min(hourStart, Math.floor(startH));
    hourEnd = Math.max(hourEnd, Math.min(24, Math.ceil(endH)));
  }

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
                    // A div with a stretched link, not a <Link> wrapping the
                    // row: Walk in / Join are links themselves, and an <a>
                    // inside an <a> is invalid HTML. Same pattern as Today's
                    // session rows.
                    <div
                      key={s.id}
                      className="relative border border-ink-200 rounded-md p-3 bg-white hover:bg-ink-50"
                    >
                      <Link
                        href={sessionHref(s)}
                        className="absolute inset-0 rounded-md"
                        aria-label={`Open ${s.clientName}`}
                      />
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
                        {/* The doorway, on the surface she actually taps on
                            a phone. Before this, every row here was a link to
                            the client file and nothing else. */}
                        {(canWalkIn(s) || s.meetUrl) && (
                          <span className="relative z-[1] flex items-center gap-2 shrink-0">
                            {canWalkIn(s) && <WalkInButton sessionId={s.id} />}
                            {s.meetUrl && <JoinMeetButton href={s.meetUrl} />}
                          </span>
                        )}
                      </div>
                    </div>
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
            height: `${(hourEnd - hourStart) * PX_PER_HOUR}px`,
          }}
        >
          {/* Time labels */}
          <div className="relative border-r border-ink-100">
            {Array.from({ length: hourEnd - hourStart }, (_, i) => {
              const h = hourStart + i;
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
            const laneOf = layoutLanes(sessionsByDay[dayIdx], tz);
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
                  const top = (startH - hourStart) * PX_PER_HOUR;
                  // Floor at a tappable/legible height — a 5-minute session
                  // would otherwise compute to ~0px and be invisible. 18px
                  // fits exactly one line of the compact layout below.
                  const height = Math.max(
                    18,
                    (s.durationMinutes / 60) * PX_PER_HOUR - 4
                  );
                  if (top < 0 || top > (hourEnd - hourStart) * PX_PER_HOUR)
                    return null;
                  const lane = laneOf.get(s.id) ?? { lane: 0, lanes: 1 };
                  const tone = toneFor(s.type);
                  const endInstant = new Date(
                    startInstant.getTime() + s.durationMinutes * 60000
                  );
                  // Under ~30px (sessions shorter than ~40 min) two stacked
                  // lines don't fit — the time row got clipped mid-glyph and
                  // the name never showed. Render ONE line instead: start
                  // time + name, vertically centred, ellipsised.
                  const compact = height < 30;
                  // Under 30px there is only the one line, and a block
                  // sharing its column with another is too narrow to hold
                  // two labels without clipping them. Both stay plain links.
                  const showActions =
                    !compact &&
                    lane.lanes === 1 &&
                    (canWalkIn(s) || Boolean(s.meetUrl));
                  const unpaid = s.status === "completed" && !s.paid;
                  return (
                    // A div with a stretched link rather than a <Link>
                    // wrapper, so Walk in / Join can live inside it without
                    // nesting anchors. The block keeps its own absolute
                    // positioning and tone styling.
                    <div
                      key={s.id}
                      className={`cal-block tone-${tone}${compact ? " compact" : ""}${showActions ? " has-actions" : ""}`}
                      style={{
                        top,
                        height,
                        // Side-by-side lanes for overlapping sessions (see
                        // layoutLanes). Keeps the 4px column gutters.
                        left: `calc(4px + (100% - 8px) * ${lane.lane} / ${lane.lanes})`,
                        width: `calc((100% - 8px) / ${lane.lanes} - ${lane.lanes > 1 ? 2 : 0}px)`,
                        right: "auto",
                      }}
                      title={`${shortTime(startInstant, tz)}–${shortTime(endInstant, tz)} · ${s.clientName} · ${s.type} · ${s.durationMinutes}m${unpaid ? " · unpaid" : ""}`}
                    >
                      <Link
                        href={sessionHref(s)}
                        className="absolute inset-0"
                        aria-label={`Open ${s.clientName}`}
                      />
                      {compact ? (
                        <div className="one">
                          <span className="t">{shortTime(startInstant, tz)}</span>{" "}
                          <span className="n">{s.clientName}</span>
                        </div>
                      ) : (
                        <>
                          <div className="t">
                            {shortTime(startInstant, tz)}–{shortTime(endInstant, tz)}
                          </div>
                          <div className="n">{s.clientName}</div>
                          {height > 44 && <div className="m">{s.type}</div>}
                        </>
                      )}
                      {/* Money still owed, visible from the grid. The week
                          view knew this and showed it only on mobile. */}
                      {unpaid && (
                        <span
                          className="cal-unpaid"
                          aria-label="Unpaid"
                          title="Unpaid"
                        />
                      )}
                      {showActions && (
                        <span className="cal-actions">
                          {/* Siblings of the stretched link, not nested
                              inside it — so no stopPropagation is needed
                              here, unlike WalkInButton's own case. */}
                          {canWalkIn(s) && (
                            <Link
                              href={`/sessions/${s.id}/prep`}
                              title="Open the prep view for this session"
                            >
                              Walk in
                            </Link>
                          )}
                          {s.meetUrl && (
                            <a
                              href={s.meetUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Join the meeting"
                            >
                              Join
                            </a>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
                {isToday && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: (nowHour - hourStart) * PX_PER_HOUR,
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
