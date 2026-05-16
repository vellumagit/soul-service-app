// Groups SessionCards by month so the Sessions tab reads like a paper log —
// month-headed pages flipping back through her history — rather than a flat
// list of database rows.

import { SessionCard } from "./SessionCard";
import type { NoteTemplate, Session } from "@/db/schema";

type Group = {
  key: string;
  label: string; // e.g. "April 2026"
  sessions: Session[];
};

function groupByMonth(sessions: Session[]): Group[] {
  // Sessions arrive sorted desc by scheduledAt from the page query.
  const grouped: Record<string, Session[]> = {};
  for (const s of sessions) {
    const d = new Date(s.scheduledAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a)) // newest month first
    .map(([key, group]) => {
      const [year, month] = key.split("-").map(Number);
      const label = new Date(year, month, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      return { key, label, sessions: group };
    });
}

export function SessionsLog({
  sessions,
  noteTemplates,
  autoUploadAiNotes,
}: {
  sessions: Session[];
  noteTemplates: NoteTemplate[];
  autoUploadAiNotes?: boolean;
}) {
  const groups = groupByMonth(sessions);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.key}>
          {/* Month header — serif, with a hairline rule that runs the width */}
          <div className="flex items-baseline gap-3 mb-3">
            <h3 className="font-serif text-lg text-ink-700 italic">
              {group.label}
            </h3>
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
