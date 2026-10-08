"use client";

// Horizontal arc of every session for a client. Lives on the client overview,
// just below the Walk-In card.
//
// What it shows:
//   - A header: "Your work together · N months · M sessions"
//   - A horizontal line spanning from the first session to the last (or to
//     today if no future sessions are scheduled)
//   - Each session as a small marker on the line, positioned proportionally
//   - Style by status: filled plum (completed) · ringed plum (scheduled) ·
//     gray × (cancelled)
//   - Honey star above any session where she captured a "never want to
//     forget" line in The Closing — those are the anchors of the arc, the
//     moments she most wanted back
//   - "Today" tick — a thin vertical line so she sees where she is in the
//     story
//   - Month labels under the line (sparingly — every 1-2 months depending
//     on density)
//   - Hover any marker for a tooltip; click to jump to that session on
//     the Sessions tab
//
// Quiet by design — this isn't a chart, it's a small arc on the page that
// lets her glance at the SHAPE of someone's becoming.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@/db/schema";
import { ArcDotCard } from "./ArcDotCard";
import { fullDate, shortDate, shortTime } from "@/lib/format";
import { useTimeZone } from "./TimeZoneProvider";
import { zonedYearMonthDay } from "@/lib/timezone";

type TimelinePoint = {
  id: string;
  date: Date;
  type: string;
  status: string;
  hasNeverForget: boolean;
  neverForgetLine: string | null;
  /** Pinned milestone label (e.g. "first breakthrough"). Null = not a
   *  milestone. Milestones get a diamond + visible label instead of just
   *  the dot, because they're explicitly-named anchor moments. */
  milestoneLabel: string | null;
  /** 1–10 "how they're feeling" from the session card. Null = not rated. */
  rating: number | null;
  /** One-line note pinned to this dot (sessions.arc_note). */
  note: string | null;
};

type ArcEdit = { rating?: number | null; note?: string | null };
const SHOW_NOTES_KEY = "journey:showNotes";

const MIN_DAYS_SPAN = 14; // ensure markers aren't all on top of each other
const MARKER_SIZE = 10;

// Vertical geometry. With no ratings the arc is the original flat line. Once
// any session is rated it grows taller: rated sessions rise to their score
// (10 at RATED_TOP, 1 at RATED_BOTTOM) and a line joins them, so the arc
// shows change over time; unrated / upcoming / cancelled stay on the
// baseline below.
const FLAT = { baseline: 60, height: 96 };
const RATED = { baseline: 142, height: 176, top: 40, bottom: 118 };

export function JourneyTimeline({
  clientId,
  sessions,
}: {
  clientId: string;
  sessions: Session[];
}) {
  const tz = useTimeZone();
  // Hovered marker — drives the tooltip.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // The dot whose click card is open.
  const [openId, setOpenId] = useState<string | null>(null);
  // Edits made in the click card, shown immediately (the server revalidates
  // the page behind them).
  const [edits, setEdits] = useState<Record<string, ArcEdit>>({});
  // "Show notes" — remembered per browser; a convenience, never required.
  const [showNotes, setShowNotes] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (localStorage.getItem(SHOW_NOTES_KEY) === "1") setShowNotes(true);
    } catch {}
  }, []);
  function toggleShowNotes() {
    const next = !showNotes;
    setShowNotes(next);
    try {
      localStorage.setItem(SHOW_NOTES_KEY, next ? "1" : "0");
    } catch {}
  }
  const applyEdit = useCallback((id: string, patch: ArcEdit) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);
  const closeCard = useCallback(() => setOpenId(null), []);

  // Sort once, derive the meaningful summary stats.
  const points = useMemo<TimelinePoint[]>(() => {
    return sessions
      .map((s) => {
        const e = edits[s.id] ?? {};
        const rating = "rating" in e ? (e.rating ?? null) : s.feelingRating;
        const note = "note" in e ? (e.note ?? null) : s.arcNote;
        return {
        id: s.id,
        date: new Date(s.scheduledAt),
        type: s.type,
        status: s.status,
        hasNeverForget:
          !!s.closingNeverForget && s.closingNeverForget.trim().length > 0,
        neverForgetLine: s.closingNeverForget,
        milestoneLabel:
          s.milestoneLabel && s.milestoneLabel.trim().length > 0
            ? s.milestoneLabel.trim()
            : null,
        rating: s.status !== "cancelled" && rating != null ? rating : null,
        note: note && note.trim().length > 0 ? note.trim() : null,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [sessions, edits]);

  if (points.length === 0) return null;

  const firstAt = points[0].date;
  const lastAt = points[points.length - 1].date;
  const today = new Date();
  // Span from first session to whichever is later: last scheduled session or
  // today. Ensures "today" always fits on the line.
  const endAt = lastAt > today ? lastAt : today;
  let totalMs = endAt.getTime() - firstAt.getTime();
  if (totalMs <= 0) totalMs = MIN_DAYS_SPAN * 24 * 60 * 60 * 1000;

  function xPercent(d: Date): number {
    const offset = d.getTime() - firstAt.getTime();
    // Two decimals: the server and client render a few ms apart and `today`
    // moves the span, so raw floats never match and React logs a hydration
    // mismatch on every profile load.
    return Number(Math.max(0, Math.min(100, (offset / totalMs) * 100)).toFixed(2));
  }

  // Counts for the header line
  const completedCount = points.filter((p) => p.status === "completed").length;
  const totalCount = points.length;
  const monthsActive = Math.max(
    1,
    Math.round(totalMs / (1000 * 60 * 60 * 24 * 30))
  );

  // Build month tick labels — every 1-2 months across the span, depending on
  // total length. Cap at ~8 visible to avoid clutter.
  const monthTicks = useMemo(() => {
    const months: { date: Date; label: string }[] = [];
    // Practice-zone months on a UTC-noon anchor, fixed locale — the local
    // Date math here rendered one tick count on the server and another in
    // the browser (hydration mismatch) for evening first sessions.
    const first = zonedYearMonthDay(firstAt, tz);
    const thisYear = zonedYearMonthDay(today, tz).year;
    const cursor = new Date(Date.UTC(first.year, first.month0, 1, 12));
    while (cursor <= endAt) {
      months.push({
        date: new Date(cursor),
        label: cursor.toLocaleDateString("en-US", {
          timeZone: "UTC",
          month: "short",
          year: cursor.getUTCFullYear() !== thisYear ? "2-digit" : undefined,
        }),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const stride = Math.max(1, Math.ceil(months.length / 8));
    return months.filter((_, i) => i % stride === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstAt.getTime(), endAt.getTime()]);

  const todayPercent = xPercent(today);
  const hovered = hoveredId
    ? points.find((p) => p.id === hoveredId)
    : null;

  const rated = points.filter((p) => p.rating != null);
  const hasRatings = rated.length > 0;
  const baseline = hasRatings ? RATED.baseline : FLAT.baseline;
  const height = hasRatings ? RATED.height : FLAT.height;
  function yFor(rating: number | null): number {
    if (rating == null) return baseline;
    return RATED.bottom - ((rating - 1) / 9) * (RATED.bottom - RATED.top);
  }
  const openPoint = openId ? (points.find((p) => p.id === openId) ?? null) : null;
  // Notes in date order, numbered for "Show notes" (badge on the dot ↔ list).
  const noted = points.filter((p) => p.note);
  const noteNumber = new Map(noted.map((p, i) => [p.id, i + 1]));

  // In date order, so the line reads left → right as change over time.
  const linePoints = rated
    .map((p) => `${xPercent(p.date)},${yFor(p.rating).toFixed(2)}`)
    .join(" ");

  return (
    // overflow-x-clip: the click card measures and nudges itself inside the
    // arc, but for the instant before it does, a centred card near the end
    // pokes past the screen — enough for a phone to widen the whole page.
    <div className="paper-card p-5 overflow-x-clip">
      <div className="flex items-baseline justify-between mb-1">
        <div
          className="serif-italic text-base text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Your work together
        </div>
        <div className="flex items-baseline gap-3">
          {noted.length > 0 && (
            <button
              type="button"
              onClick={toggleShowNotes}
              aria-pressed={showNotes}
              className="text-[11px] text-plum-700 hover:underline"
            >
              {showNotes ? "Hide notes" : `Show notes (${noted.length})`}
            </button>
          )}
          <div className="text-[10px] uppercase tracking-wider text-ink-400 font-mono">
            {monthsActive} {monthsActive === 1 ? "month" : "months"} ·{" "}
            {completedCount} held{totalCount > completedCount ? ` · ${totalCount - completedCount} ahead` : ""}
          </div>
        </div>
      </div>
      <div className="text-[11px] text-ink-500 mb-5">
        Began {fullDate(firstAt, tz)}.
        {rated.length >= 2 && (
          <>
            {" "}
            Feeling{" "}
            <span className="text-plum-700 font-medium tabular-nums">
              {rated[0].rating} → {rated[rated.length - 1].rating}
            </span>{" "}
            <span className="text-ink-400">(first → latest rated)</span>
          </>
        )}
      </div>

      {/* The arc itself — relative-positioned canvas; markers absolute.
          Taller now to make room for milestone labels above the line. */}
      <div className="relative w-full" style={{ height }}>
        {/* Baseline — pushed down so labels above have room. */}
        <div
          className="absolute left-0 right-0 bg-ink-200"
          style={{ top: baseline, height: 1 }}
        />

        {/* Feeling scale — faint guides at 10 and 1, and the line through
            every rated session. x is in % (viewBox 0–100), y in px. */}
        {hasRatings && (
          <>
            {[10, 1].map((v) => (
              <div key={v} className="absolute left-0 right-0 pointer-events-none" style={{ top: yFor(v) }}>
                <div className="border-t border-dashed border-ink-100" />
                <span
                  className="absolute text-[9px] text-ink-300 font-mono tabular-nums"
                  style={{ left: -16, top: -6 }}
                >
                  {v}
                </span>
              </div>
            ))}
            {rated.length >= 2 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                viewBox={`0 0 100 ${height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke="var(--color-plum-300)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </>
        )}

        {/* Today tick — only shown if today is somewhere inside the span */}
        {today >= firstAt && today <= endAt && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: `${todayPercent}%`, width: 1 }}
          >
            <div className="absolute inset-y-0 w-px bg-plum-300" />
            <div
              className="absolute -translate-x-1/2 text-[9px] uppercase tracking-wider text-plum-600 font-semibold whitespace-nowrap"
              style={{ top: baseline - 12 }}
            >
              now
            </div>
          </div>
        )}

        {/* Session markers — centered on the baseline (top: 60). */}
        {points.map((p) => {
          const left = xPercent(p.date);
          const isCancelled = p.status === "cancelled";
          const isCompleted = p.status === "completed";
          const isMilestone = !!p.milestoneLabel;
          return (
            <button
              key={p.id}
              type="button"
              data-arc-dot
              onClick={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(p.id)}
              onBlur={() => setHoveredId(null)}
              aria-haspopup="dialog"
              aria-expanded={openId === p.id}
              aria-label={`${p.type} on ${fullDate(p.date, tz)}${
                p.rating != null ? `, feeling ${p.rating} out of 10` : ""
              }${p.milestoneLabel ? ` — ${p.milestoneLabel}` : ""}${
                p.note ? `. Note: ${p.note}` : ""
              }`}
              className="absolute group p-0 border-0 bg-transparent cursor-pointer"
              style={{
                left: `calc(${left}% - ${MARKER_SIZE / 2}px)`,
                top: yFor(p.rating) - MARKER_SIZE / 2,
                width: MARKER_SIZE,
                height: MARKER_SIZE,
              }}
            >
              {/* Bigger invisible hit area — a 10px dot is a hard tap on an iPad. */}
              <span aria-hidden="true" className="absolute -inset-[7px]" />
              {/* Note mark: a small dot, or its number when "Show notes" is on. */}
              {p.note &&
                (showNotes ? (
                  <span
                    aria-hidden="true"
                    className="absolute flex items-center justify-center rounded-full bg-plum-100 text-plum-800 font-semibold tabular-nums"
                    style={{ left: 7, top: -11, minWidth: 13, height: 13, fontSize: 8, padding: "0 3px" }}
                  >
                    {noteNumber.get(p.id)}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="absolute rounded-full bg-plum-300"
                    style={{ left: 8, top: -5, width: 5, height: 5 }}
                    title="Has a note"
                  />
                ))}
              {/* Milestone label + diamond — sit above the dot. The label is
                  always visible so the named anchors of the arc are readable
                  at a glance. */}
              {isMilestone && (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 -translate-x-1/2 text-honey-600"
                    style={{ top: -16, fontSize: 11, lineHeight: 1 }}
                  >
                    ◆
                  </span>
                  <span
                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-honey-700 font-medium"
                    style={{ top: -32, lineHeight: 1 }}
                    title={p.milestoneLabel ?? undefined}
                  >
                    {p.milestoneLabel && p.milestoneLabel.length > 24
                      ? p.milestoneLabel.slice(0, 22) + "…"
                      : p.milestoneLabel}
                  </span>
                </>
              )}

              {/* The honey star for "never forget" sessions WITHOUT a
                  milestone — when both apply, the milestone diamond takes
                  precedence (don't stack symbols). */}
              {!isMilestone && p.hasNeverForget && (
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 -translate-x-1/2 text-honey-500"
                  style={{ top: -14, fontSize: 12, lineHeight: 1 }}
                  title="A line you didn't want to forget"
                >
                  ✦
                </span>
              )}

              {isCancelled ? (
                <span
                  aria-hidden="true"
                  className="block text-ink-300 group-hover:text-ink-500"
                  style={{ fontSize: MARKER_SIZE, lineHeight: 1 }}
                >
                  ×
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`block rounded-full transition-transform group-hover:scale-125 ${
                    isCompleted ? "bg-plum-500" : "border-2 border-plum-500 bg-white"
                  }`}
                  style={{ width: MARKER_SIZE, height: MARKER_SIZE }}
                />
              )}
            </button>
          );
        })}

        {/* Click card — opens just under its dot. Keyed by dot so switching
            dots remounts it (and flushes the previous dot's pending note). */}
        {openPoint && (
          <ArcDotCard
            key={openPoint.id}
            dot={openPoint}
            clientId={clientId}
            tz={tz}
            leftPercent={xPercent(openPoint.date)}
            top={yFor(openPoint.rating) + MARKER_SIZE}
            onChange={applyEdit}
            onClose={closeCard}
          />
        )}

        {/* Month tick labels below the baseline */}
        {monthTicks.map((m, i) => (
          <div
            key={i}
            className="absolute text-[9px] text-ink-400 font-mono whitespace-nowrap"
            style={{
              left: `${xPercent(m.date)}%`,
              top: baseline + 10,
              transform: "translateX(-50%)",
            }}
          >
            {m.label}
          </div>
        ))}
      </div>

      {/* Hover tooltip — appears below the timeline so it doesn't fight with
          markers. Shows the date, type, and the never-forget line if any. */}
      <div className="mt-2 min-h-[42px] text-xs">
        {hovered ? (
          <div
            className="rounded-md p-2 leading-snug"
            style={{
              background: "var(--color-plum-50)",
              border: "1px solid var(--color-plum-100)",
            }}
          >
            <div className="text-ink-900 font-medium">
              {fullDate(hovered.date, tz)}
              <span className="text-ink-400 mx-1.5">·</span>
              <span className="text-ink-600 font-normal">
                {shortTime(hovered.date, tz)} · {hovered.type}
              </span>
              {hovered.rating != null && (
                <>
                  <span className="text-ink-400 mx-1.5">·</span>
                  <span className="text-plum-700 tabular-nums">
                    feeling {hovered.rating}/10
                  </span>
                </>
              )}
            </div>
            {hovered.note && (
              <div className="mt-1 text-ink-800">{hovered.note}</div>
            )}
            {hovered.neverForgetLine && (
              <div className="mt-1 text-ink-700 italic">
                &ldquo;{hovered.neverForgetLine}&rdquo;
              </div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-ink-400 italic">
            Hover a dot to see what was there; click one to rate it or add a note.
            {hasRatings && <> Higher dots = feeling better (1–10).</>}
            {points.some((p) => p.milestoneLabel) && (
              <>
                {" "}
                <span className="text-honey-700">◆</span> = pinned milestones.
              </>
            )}
            {points.some(
              (p) => !p.milestoneLabel && p.hasNeverForget
            ) && (
              <>
                {" "}
                <span className="text-honey-700">✦</span> = a line you
                didn&apos;t want to forget.
              </>
            )}
          </div>
        )}
      </div>

      {/* "Show notes" — every arc note in date order, numbered to match the
          badges on the dots. Reads as the story of the work; tap one to open
          its dot. */}
      {showNotes && noted.length > 0 && (
        <ol className="mt-3 border-t border-ink-100 pt-3 space-y-1.5">
          {noted.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-arc-dot
                onClick={() => setOpenId(p.id)}
                className="w-full text-left flex gap-2 text-xs leading-snug hover:bg-plum-50 rounded px-1 py-0.5"
              >
                <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-plum-100 text-plum-800 font-semibold tabular-nums text-[9px] min-w-[15px] h-[15px] px-1 mt-px">
                  {noteNumber.get(p.id)}
                </span>
                <span className="shrink-0 text-ink-500 tabular-nums w-[74px]">
                  {shortDate(p.date, tz)}
                  {p.rating != null && <span className="text-plum-600"> · {p.rating}</span>}
                </span>
                <span className="text-ink-800">{p.note}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
