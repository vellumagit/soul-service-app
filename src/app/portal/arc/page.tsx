// "The arc" — the client's view of their own work over time.
//
// Mirrors the practitioner's JourneyTimeline on the client overview, but
// in list form (timelines are dense; this is for reading). Every
// non-cancelled session, newest first, with:
//   - date + time + type
//   - her intention for the session (if she wrote one)
//   - their own intention they brought (if they wrote one via /portal/sessions/[id])
//   - the short visible note she chose to share (if any)
//
// Read-only. The shape of their becoming, made visible to them.

import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { requirePortalSession } from "@/lib/portal-auth";
import { fullDate, shortTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalArcPage() {
  const session = await requirePortalSession();
  const now = new Date();

  const sessionRows = await db
    .select({
      id: sessions.id,
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      type: sessions.type,
      status: sessions.status,
      intention: sessions.intention,
      clientStatedIntention: sessions.clientStatedIntention,
      clientVisibleNote: sessions.clientVisibleNote,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.accountId, session.accountId),
        eq(sessions.clientId, session.clientId),
        ne(sessions.status, "cancelled")
      )
    )
    .orderBy(desc(sessions.scheduledAt));

  const firstName =
    session.clientFullName.split(" ")[0] ?? session.clientFullName;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <header className="mb-7">
        <h1
          className="text-2xl md:text-3xl text-ink-900 serif mb-1"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          The arc
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          {sessionRows.length === 0
            ? `Your sessions will appear here, ${firstName}.`
            : `The shape of your work over time. ${sessionRows.length} session${
                sessionRows.length === 1 ? "" : "s"
              } so far.`}
        </p>
      </header>

      {sessionRows.length === 0 ? (
        <div className="paper-card p-10 text-center text-sm text-ink-500 italic">
          Nothing held yet. Come back after your first session.
        </div>
      ) : (
        <ol className="space-y-4">
          {sessionRows.map((s) => {
            const at = new Date(s.scheduledAt);
            const isPast = at < now || s.status === "completed";
            const intention = s.intention?.trim() || null;
            const clientIntention = s.clientStatedIntention?.trim() || null;
            const visibleNote = s.clientVisibleNote?.trim() || null;
            return (
              <li key={s.id} className="paper-card p-5 md:p-6">
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <p
                      className="text-base text-ink-900 serif"
                      style={{ fontWeight: 500, letterSpacing: "-0.01em" }}
                    >
                      {fullDate(at)}
                    </p>
                    <p className="text-[12px] text-ink-500">
                      {shortTime(at)} · {s.durationMinutes} min · {s.type}
                    </p>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded"
                    style={{
                      background: isPast
                        ? "var(--color-plum-50)"
                        : "var(--color-honey-50)",
                      color: isPast
                        ? "var(--color-plum-700)"
                        : "var(--color-honey-700)",
                    }}
                  >
                    {isPast ? "held" : "coming up"}
                  </span>
                </div>

                {/* Her intention — if set */}
                {intention && (
                  <div
                    className="serif-italic text-sm text-ink-700 leading-relaxed mt-3 pl-3 border-l-2"
                    style={{
                      fontWeight: 400,
                      borderColor: "var(--color-honey-300)",
                    }}
                  >
                    &ldquo;{intention}&rdquo;
                    <p className="text-[11px] text-ink-500 italic mt-1 not-italic">
                      <span className="serif-italic">— intention for the session</span>
                    </p>
                  </div>
                )}

                {/* Client's own intention */}
                {clientIntention && (
                  <div
                    className="serif-italic text-sm text-ink-700 leading-relaxed mt-3 pl-3 border-l-2"
                    style={{
                      fontWeight: 400,
                      borderColor: "var(--color-plum-300)",
                    }}
                  >
                    &ldquo;{clientIntention}&rdquo;
                    <p className="text-[11px] text-ink-500 italic mt-1 not-italic">
                      <span className="serif-italic">— what you brought</span>
                    </p>
                  </div>
                )}

                {/* Her shared post-session note */}
                {visibleNote && (
                  <div
                    className="rounded-md p-3 mt-3 text-sm leading-relaxed"
                    style={{
                      background: "var(--color-honey-50)",
                      border: "1px solid var(--color-honey-100)",
                    }}
                  >
                    <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-1.5">
                      A note from her
                    </p>
                    <p className="serif-italic text-ink-800" style={{ fontWeight: 400 }}>
                      &ldquo;{visibleNote}&rdquo;
                    </p>
                  </div>
                )}

                {!isPast && (
                  <div className="mt-3">
                    <Link
                      href={`/portal/sessions/${s.id}`}
                      className="text-xs text-plum-700 hover:underline font-medium"
                    >
                      Open this session →
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
