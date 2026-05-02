import type { ClientDigest } from "@/db/queries";
import { fullDate, relativeTime, shortTime } from "@/lib/format";

// The 30-second snapshot before next session. Auto-derived from existing data —
// no manual maintenance. Designed to be read in one breath.
export function WhereWeLeftOffCard({
  digest,
  clientName,
}: {
  digest: ClientDigest;
  clientName: string;
}) {
  const hasAnything =
    digest.lastSession ||
    digest.nextSession ||
    digest.openTasks.length > 0 ||
    digest.workingOn ||
    digest.latestIntention;

  if (!hasAnything) {
    return null;
  }

  return (
    <div className="border border-flame-200 bg-gradient-to-br from-flame-50 to-white rounded-lg p-5">
      <div className="text-[10px] uppercase tracking-wider text-flame-700 font-semibold mb-3">
        Before you sit with {clientName.split(" ")[0]}
      </div>

      {digest.nextSession && (
        <div className="mb-4 pb-4 border-b border-flame-100">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
            Next session
          </div>
          <div className="text-sm text-ink-900 font-medium">
            {fullDate(digest.nextSession.when)}{" "}
            <span className="text-ink-500 font-normal">
              · {shortTime(digest.nextSession.when)} ·{" "}
              {digest.nextSession.type} · {digest.nextSession.durationMinutes}m
            </span>
          </div>
          {digest.nextSession.meetUrl && (
            <a
              href={digest.nextSession.meetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-flame-700 hover:text-flame-600"
            >
              Join Meet ↗
            </a>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {digest.lastSession && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
              Last session ({relativeTime(digest.lastSession.when)})
            </div>
            <div className="text-sm text-ink-700">
              {digest.lastSession.type}
              {digest.lastSession.intention && (
                <span className="text-ink-500 italic">
                  {" — "}
                  &ldquo;{digest.lastSession.intention}&rdquo;
                </span>
              )}
            </div>
            {(digest.lastSession.arrivedAs || digest.lastSession.leftAs) && (
              <div className="text-xs text-ink-600 mt-1">
                {digest.lastSession.arrivedAs && (
                  <>
                    Arrived: <em>{digest.lastSession.arrivedAs}</em>
                  </>
                )}
                {digest.lastSession.arrivedAs && digest.lastSession.leftAs && (
                  <span className="text-ink-300"> · </span>
                )}
                {digest.lastSession.leftAs && (
                  <>
                    Left: <em>{digest.lastSession.leftAs}</em>
                  </>
                )}
              </div>
            )}
            {digest.lastSession.notesExcerpt && (
              <div className="text-xs text-ink-600 mt-2 leading-relaxed bg-white border border-flame-100 rounded p-2 line-clamp-4">
                {digest.lastSession.notesExcerpt}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {digest.workingOn && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
                Currently working on
              </div>
              <div className="text-sm text-ink-700">{digest.workingOn}</div>
            </div>
          )}

          {digest.topGoals.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
                Active goals
              </div>
              <ul className="text-sm text-ink-700 space-y-0.5">
                {digest.topGoals.map((g) => (
                  <li key={g.id} className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-ink-400 w-9 shrink-0">
                      {g.progress}%
                    </span>
                    <span className="truncate">{g.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {digest.openTasks.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
                Open threads · {digest.openTasks.length}
              </div>
              <ul className="text-sm text-ink-700 space-y-0.5">
                {digest.openTasks.map((t) => (
                  <li key={t.id} className="flex items-baseline gap-2">
                    <span className="text-ink-400 mt-0.5">•</span>
                    <span className="flex-1">{t.title}</span>
                    {t.dueAt && (
                      <span className="font-mono text-[10px] text-ink-400 shrink-0">
                        {relativeTime(t.dueAt)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {digest.latestIntention && !digest.lastSession?.intention && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
                Last stated intention
              </div>
              <div className="text-sm text-ink-700 italic">
                &ldquo;{digest.latestIntention.text}&rdquo;
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
