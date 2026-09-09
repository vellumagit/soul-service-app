// Groups SessionCards by month so the Sessions tab reads like a paper log —
// month-headed pages flipping back through her history — rather than a flat
// list of database rows.
//
// The month header is a quiet link to the calendar at that month — gives her
// a one-click way to jump from "this client's April" to "everything I did in
// April" without losing her place. Hover to reveal the link affordance so the
// regular reading view stays clean.
//
// Pagination: a client with a long recurring series can have hundreds of
// sessions. Rendering them all mounted hundreds of SessionCards (and every
// scheduled one auto-expanded its whole form), which froze the page for a
// minute. We now render only the most recent PAGE_SIZE and reveal older ones
// on demand — the DOM the browser mounts stays bounded no matter the history.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SessionCard } from "./SessionCard";
import { zonedDateKey } from "@/lib/timezone";
import type { NoteTemplate, Session } from "@/db/schema";

/** How many sessions to show before "Show older". One page is roughly a year
 *  of weekly work — enough that most visits never need to expand. */
const PAGE_SIZE = 30;

type Group = {
  key: string;
  label: string; // e.g. "April 2026"
  /** ISO at noon UTC on the 1st of the month — for the Calendar deep-link. */
  monthStartIso: string;
  sessions: Session[];
};

function groupByMonth(sessions: Session[], timeZone?: string): Group[] {
  // Sessions arrive sorted desc by scheduledAt from the page query. Group by
  // HER local month so a late-evening session doesn't slip into the next
  // month's header when the server (UTC) or a remote viewer reads it.
  const grouped: Record<string, Session[]> = {};
  for (const s of sessions) {
    // "YYYY-MM" of the session as seen in the practice timezone.
    const key = zonedDateKey(new Date(s.scheduledAt), timeZone ?? "UTC").slice(
      0,
      7
    );
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a)) // newest month first
    .map(([key, group]) => {
      const [year, month1] = key.split("-").map(Number);
      const month = month1 - 1; // 0-based
      const label = new Date(year, month, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      // Noon UTC on the 1st — avoids any edge-of-day timezone weirdness when
      // the Calendar page interprets it back into a month boundary.
      const monthStartIso = new Date(
        Date.UTC(year, month, 1, 12, 0, 0)
      ).toISOString();
      return { key, label, monthStartIso, sessions: group };
    });
}

export function SessionsLog({
  sessions,
  clientName,
  noteTemplates,
  autoUploadAiNotes,
  timeZone,
  clientPortalEnabled = false,
  defaultRateCents = null,
}: {
  sessions: Session[];
  /** The client these sessions belong to — passed through to SessionCard so
   *  the Closing Ritual dialog can address her by name ("Sit with Maria for
   *  a moment…"). */
  clientName: string;
  noteTemplates: NoteTemplate[];
  autoUploadAiNotes?: boolean;
  /** Practice timezone — groups sessions by HER local month. */
  timeZone?: string;
  /** Passed to SessionCard so the shared-note block can say whether the
   *  client actually has a portal to read it in. */
  clientPortalEnabled?: boolean;
  /** Passed through to Mark paid so the amount box opens pre-filled. */
  defaultRateCents?: number | null;
}) {
  // Sessions arrive sorted desc by scheduledAt. Show the most recent slice;
  // older ones stay off the page (and un-mounted) until she asks for them.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // A journey-timeline marker links to #<sessionId>. If that session sits
  // below the first page, reveal up to it and scroll there — otherwise the
  // click silently did nothing.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx < 0) return;
    if (idx >= visibleCount) {
      setVisibleCount(Math.ceil((idx + 1) / PAGE_SIZE) * PAGE_SIZE);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount]);
  const visible = sessions.slice(0, visibleCount);
  const remaining = sessions.length - visible.length;

  // Auto-expand only ONE card: the soonest upcoming (scheduled) session — the
  // one she's most likely acting on. Everything else starts collapsed so the
  // browser doesn't mount hundreds of forms at once. "Soonest upcoming" =
  // the last scheduled row in a desc-sorted list.
  const firstOpenId =
    [...visible].reverse().find((s) => s.status === "scheduled")?.id ?? null;

  const groups = groupByMonth(visible, timeZone);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.key}>
          {/* Month header — serif title is a quiet link to the calendar at
              that month. Plain ink on idle, hint of plum on hover so the
              link affordance only shows up when she's actually pointing at it. */}
          <div className="flex items-baseline gap-3 mb-3 group">
            <Link
              href={`/calendar?view=month&start=${encodeURIComponent(group.monthStartIso)}`}
              className="font-serif text-lg text-ink-700 italic hover:text-plum-700 transition-colors inline-flex items-baseline gap-1.5"
              title={`Open ${group.label} on the calendar`}
            >
              {group.label}
              <span
                className="text-[10px] not-italic text-plum-500 opacity-0 group-hover:opacity-100 transition-opacity translate-y-[-1px]"
                aria-hidden="true"
              >
                →
              </span>
            </Link>
            <div className="flex-1 border-t border-ink-200" />
            <span className="text-[10px] uppercase tracking-wider text-ink-400 font-mono">
              {group.sessions.length}{" "}
              {group.sessions.length === 1 ? "session" : "sessions"}
            </span>
          </div>

          <div className="space-y-3">
            {group.sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                clientName={clientName}
                noteTemplates={noteTemplates}
                autoUploadAiNotes={autoUploadAiNotes}
                clientPortalEnabled={clientPortalEnabled}
                defaultRateCents={defaultRateCents}
                defaultOpen={s.id === firstOpenId}
              />
            ))}
          </div>
        </div>
      ))}

      {remaining > 0 && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((n) => Math.min(n + PAGE_SIZE, sessions.length))
            }
            className="text-sm text-plum-700 hover:underline"
          >
            Show older sessions{" "}
            <span className="text-ink-400">
              ({remaining} more)
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
