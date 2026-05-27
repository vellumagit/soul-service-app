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

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Session } from "@/db/schema";
import { fullDate, shortTime } from "@/lib/format";

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
};

const MIN_DAYS_SPAN = 14; // ensure markers aren't all on top of each other
const MARKER_SIZE = 10;

export function JourneyTimeline({
  clientId,
  sessions,
}: {
  clientId: string;
  sessions: Session[];
}) {
  // Hovered marker — drives the tooltip.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Sort once, derive the meaningful summary stats.
  const points = useMemo<TimelinePoint[]>(() => {
    return sessions
      .map((s) => ({
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
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [sessions]);

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
    return Math.max(0, Math.min(100, (offset / totalMs) * 100));
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
    const cursor = new Date(firstAt.getFullYear(), firstAt.getMonth(), 1);
    while (cursor <= endAt) {
      months.push({
        date: new Date(cursor),
        label: cursor.toLocaleDateString(undefined, {
          month: "short",
          year: cursor.getFullYear() !== today.getFullYear() ? "2-digit" : undefined,
        }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const stride = Math.max(1, Math.ceil(months.length / 8));
    return months.filter((_, i) => i % stride === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstAt.getTime(), endAt.getTime()]);

  const todayPercent = xPercent(today);
  const hovered = hoveredId
    ? points.find((p) => p.id === hoveredId)
    : null;

  return (
    <div className="paper-card p-5">
      <div className="flex items-baseline justify-between mb-1">
        <div
          className="serif-italic text-base text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Your work together
        </div>
        <div className="text-[10px] uppercase tracking-wider text-ink-400 font-mono">
          {monthsActive} {monthsActive === 1 ? "month" : "months"} ·{" "}
          {completedCount} held{totalCount > completedCount ? ` · ${totalCount - completedCount} ahead` : ""}
        </div>
      </div>
      <div className="text-[11px] text-ink-500 mb-5">
        Began {fullDate(firstAt)}.
      </div>

      {/* The arc itself — relative-positioned canvas; markers absolute.
          Taller now to make room for milestone labels above the line. */}
      <div className="relative w-full" style={{ height: 96 }}>
        {/* Baseline — pushed down so labels above have room. */}
        <div
          className="absolute left-0 right-0 bg-ink-200"
          style={{ top: 60, height: 1 }}
        />

        {/* Today tick — only shown if today is somewhere inside the span */}
        {today >= firstAt && today <= endAt && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: `${todayPercent}%`, width: 1 }}
          >
            <div className="absolute inset-y-0 w-px bg-plum-300" />
            <div
              className="absolute -translate-x-1/2 text-[9px] uppercase tracking-wider text-plum-600 font-semibold whitespace-nowrap"
              style={{ top: 48 }}
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
            <Link
              key={p.id}
              href={`/clients/${clientId}?tab=sessions#${p.id}`}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(p.id)}
              onBlur={() => setHoveredId(null)}
              aria-label={`${p.type} on ${fullDate(p.date)}${
                p.milestoneLabel ? ` — ${p.milestoneLabel}` : ""
              }`}
              className="absolute group"
              style={{
                left: `calc(${left}% - ${MARKER_SIZE / 2}px)`,
                top: 60 - MARKER_SIZE / 2,
                width: MARKER_SIZE,
                height: MARKER_SIZE,
              }}
            >
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
            </Link>
          );
        })}

        {/* Month tick labels below the baseline */}
        {monthTicks.map((m, i) => (
          <div
            key={i}
            className="absolute text-[9px] text-ink-400 font-mono whitespace-nowrap"
            style={{
              left: `${xPercent(m.date)}%`,
              top: 70,
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
              {fullDate(hovered.date)}
              <span className="text-ink-400 mx-1.5">·</span>
              <span className="text-ink-600 font-normal">
                {shortTime(hovered.date)} · {hovered.type}
              </span>
            </div>
            {hovered.neverForgetLine && (
              <div className="mt-1 text-ink-700 italic">
                &ldquo;{hovered.neverForgetLine}&rdquo;
              </div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-ink-400 italic">
            Hover a dot to see what was there.
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
    </div>
  );
}
