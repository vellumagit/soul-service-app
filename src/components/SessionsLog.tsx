// Groups SessionCards by month so the Sessions tab reads like a paper log —
// month-headed pages flipping back through her history — rather than a flat
// list of database rows.
//
// The month header is a quiet link to the calendar at that month — gives her
// a one-click way to jump from "this client's April" to "everything I did in
// April" without losing her place. Hover to reveal the link affordance so the
// regular reading view stays clean.

import Link from "next/link";
import { SessionCard } from "./SessionCard";
import { zonedDateKey } from "@/lib/timezone";
import type { NoteTemplate, Session } from "@/db/schema";

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
}) {
  const groups = groupByMonth(sessions, timeZone);

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
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
