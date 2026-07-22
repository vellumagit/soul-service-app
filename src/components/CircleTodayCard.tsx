// "Walk into the Circle" — the host doorway on Today, mirroring the 1-on-1
// "Walk in". One tap opens her room, with everyone's names already in front of
// her so she isn't hunting for the roster while people arrive.

import Link from "next/link";
import type { TodayCircleRow } from "@/db/queries";

export function CircleTodayCard({
  circle,
  meetingUrl,
  whenLabel,
}: {
  circle: TodayCircleRow;
  meetingUrl: string | null;
  whenLabel: string;
}) {
  const total = circle.attendees.length;
  const paid = circle.attendees.filter((a) => a.paid).length;

  return (
    <section className="paper-card p-5 border-l-2 border-plum-300">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2
          className="serif-italic text-xl text-plum-700"
          style={{ fontWeight: 400 }}
        >
          {circle.groupName}
        </h2>
        <span className="text-[11px] uppercase tracking-wider font-mono text-ink-500">
          Circle today
        </span>
      </div>
      <div className="text-[12px] text-ink-500 font-mono mb-3">
        {whenLabel} · {total} {total === 1 ? "person" : "people"} · {paid} paid
      </div>

      {total > 0 ? (
        <p className="text-sm text-ink-700 leading-relaxed mb-4">
          {circle.attendees.map((a, i) => (
            <span key={`${a.name}-${i}`}>
              {i > 0 && <span className="text-ink-300"> · </span>}
              <span className={a.paid ? "" : "text-ink-500"}>{a.name}</span>
              {!a.paid && (
                <span className="text-[10px] text-honey-700 ml-1">unpaid</span>
              )}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-sm text-ink-500 italic mb-4">
          No one has reserved a seat yet.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {meetingUrl ? (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md px-4 py-2 font-medium"
          >
            Walk into the Circle →
          </a>
        ) : (
          <span className="text-[12px] text-honey-700">
            No meeting link yet — add your standing room in Settings.
          </span>
        )}
        <Link
          href={`/groups/${circle.groupId}`}
          className="text-xs text-ink-500 hover:text-plum-700"
        >
          Open the Circle
        </Link>
      </div>
    </section>
  );
}
