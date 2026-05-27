// The Threshold — a full-bleed, phone-first prep view for the doorway
// moment before a session begins.
//
// Deliberately NOT inside AppShell — no sidebar, no top bar, no search
// chrome. Just the content she needs to settle into the work. Single
// column, generous spacing, Fraunces serif. Reads like the opening page
// of someone's chapter.
//
// Pulled up via "Walk in →" links on Today, ClientHeader, WalkInCard.
// Direct URL: /sessions/<id>/prep.
//
// Designed for phone but works at any width.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session-cookies";
import { getSessionPrep } from "@/db/queries";
import { fullDate, shortTime, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ThresholdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { accountId } = await requireSession();
  const { id } = await params;

  const prep = await getSessionPrep(accountId, id);
  if (!prep) notFound();

  // If she lands on a cancelled session by accident, bounce her — the
  // ritual is for sessions that are actually happening.
  if (prep.session.status === "cancelled") {
    redirect(`/clients/${prep.client.id}`);
  }

  const { session, client, lastSession, themes } = prep;
  const firstName = client.fullName.split(" ")[0] ?? client.fullName;
  const startsRelative = relativeTime(session.scheduledAt);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, var(--color-plum-50) 0%, var(--color-app-bg) 55%, var(--color-parchment) 100%)",
      }}
    >
      {/* Quiet top bar — just a way back. No nav chrome, no sidebar. */}
      <div className="px-5 md:px-8 py-4 flex items-center">
        <Link
          href={`/clients/${client.id}`}
          className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1.5"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to {firstName}&apos;s file
        </Link>
        <div className="flex-1" />
        <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
          The Threshold
        </span>
      </div>

      {/* The reading column — narrow, centered, generous. */}
      <main className="flex-1 flex flex-col items-center px-5 md:px-8 py-6 md:py-12">
        <article className="w-full max-w-xl space-y-10">
          {/* Header — who, when */}
          <header className="text-center space-y-2">
            <div
              className="serif text-3xl md:text-4xl text-ink-900"
              style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
            >
              {client.fullName}
            </div>
            <div className="text-sm text-ink-600">
              {session.type}
              <span className="text-ink-300 mx-2">·</span>
              {shortTime(session.scheduledAt)}{" "}
              <span className="text-ink-400">
                ({session.durationMinutes} min)
              </span>
            </div>
            <div className="text-xs text-plum-700 italic">
              {startsRelative}
            </div>
          </header>

          {/* Sensitivities — soft reminder at the top, just for her */}
          {client.sensitivities.length > 0 && (
            <div
              className="rounded-lg p-3 text-xs leading-relaxed"
              style={{
                background: "var(--color-honey-50)",
                border: "1px solid var(--color-honey-100)",
                color: "var(--color-ink-700)",
              }}
            >
              <span className="font-semibold tracking-wider uppercase text-[10px] text-honey-700 mr-2">
                Hold gently:
              </span>
              {client.sensitivities.join(" · ")}
            </div>
          )}

          {/* The intention — her voice, as a pull-quote */}
          {(session.intention || client.workingOn) && (
            <section className="py-2">
              <blockquote
                className="serif-italic text-xl md:text-2xl text-ink-800 leading-relaxed text-center px-2"
                style={{ fontWeight: 400 }}
              >
                <span className="text-plum-700">&ldquo;</span>
                {session.intention ?? client.workingOn}
                <span className="text-plum-700">&rdquo;</span>
              </blockquote>
              <div className="text-[11px] text-ink-500 text-center mt-3 tracking-wide">
                {session.intention
                  ? `What ${firstName} asked for from today`
                  : `What you're holding for ${firstName} right now`}
              </div>
            </section>
          )}

          {/* Where you left off — last session's texture */}
          {lastSession && (
            <section className="space-y-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold text-center">
                Where you left off
              </div>
              <div className="text-center text-sm text-ink-600">
                {fullDate(lastSession.scheduledAt)}
                <span className="text-ink-300 mx-2">·</span>
                {relativeTime(lastSession.scheduledAt)}
              </div>

              {(lastSession.arrivedAs || lastSession.leftAs) && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {lastSession.arrivedAs && (
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                        Arrived
                      </div>
                      <div className="text-ink-700 italic leading-snug">
                        {lastSession.arrivedAs}
                      </div>
                    </div>
                  )}
                  {lastSession.leftAs && (
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                        Left
                      </div>
                      <div className="text-ink-700 italic leading-snug">
                        {lastSession.leftAs}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prefer the "never want to forget" line from her closing —
                  that's the most important thing she'd want back. Fall back
                  to other closing lines, then notes excerpt. */}
              {lastSession.closingNeverForget ? (
                <ClosingEcho
                  label="She said"
                  body={lastSession.closingNeverForget}
                />
              ) : lastSession.closingRemember ? (
                <ClosingEcho
                  label="What landed"
                  body={lastSession.closingRemember}
                />
              ) : lastSession.closingLanded ? (
                <ClosingEcho
                  label="Last closing"
                  body={lastSession.closingLanded}
                />
              ) : lastSession.notesExcerpt ? (
                <p className="text-sm text-ink-600 italic leading-relaxed border-l-2 border-ink-200 pl-4 max-w-prose mx-auto">
                  {lastSession.notesExcerpt}
                </p>
              ) : null}
            </section>
          )}

          {/* Themes still alive */}
          {themes.length > 0 && (
            <section className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold text-center">
                Still alive
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {themes.map((t) => (
                  <span key={t.id} className="chip bg-plum-50 text-plum-700">
                    {t.label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* The CTA — Join Meet, or a quiet note that there's no link yet */}
          <section className="pt-4 pb-2 text-center">
            {session.meetUrl ? (
              <a
                href={session.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium text-white shadow-lg hover:shadow-xl transition-all"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-plum-600) 0%, var(--color-plum-700) 100%)",
                }}
              >
                Join Meet
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            ) : (
              <div className="text-xs text-ink-500 italic">
                No Meet link on this session.{" "}
                <Link
                  href={`/clients/${client.id}?tab=sessions`}
                  className="text-plum-700 hover:underline not-italic"
                >
                  Open the session card to add one
                </Link>
                .
              </div>
            )}
          </section>

          {/* A breath, then a quiet footer link back to the full file */}
          <div className="pt-6 text-center">
            <Link
              href={`/clients/${client.id}?tab=sessions`}
              className="text-[11px] text-ink-400 hover:text-ink-700 italic"
            >
              Open her full file →
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}

function ClosingEcho({ label, body }: { label: string; body: string }) {
  return (
    <div className="max-w-prose mx-auto pt-2">
      <div className="text-[10px] uppercase tracking-wider text-plum-600 font-semibold text-center mb-1">
        {label}
      </div>
      <p
        className="serif-italic text-base text-ink-800 leading-relaxed text-center px-2"
        style={{ fontWeight: 400 }}
      >
        &ldquo;{body}&rdquo;
      </p>
    </div>
  );
}
