// The "Walk-In Page" — what she sees when she opens this client's file.
// Designed to be read in one breath BEFORE walking into the session.
//
// Three layered pieces, in order of emotional priority:
//   1. Her voice — last stated intention as a pull-quote (or workingOn fallback)
//   2. Where we left off — last session's tone + notes preview
//   3. Coming up — next session details
//
// This intentionally avoids stats and money. Those live in the strip below
// for when they're actually wanted, not as the first thing the practitioner
// reads about a person.

import Link from "next/link";
import type { ClientDigest } from "@/db/queries";
import { fullDate, relativeTime, shortTime } from "@/lib/format";

export function WalkInCard({
  digest,
  clientName,
}: {
  digest: ClientDigest;
  clientName: string;
}) {
  const firstName = clientName.split(" ")[0] ?? clientName;

  // The "pull quote": prefer her own words (latestIntention.text), fall back
  // to the practitioner's framing (workingOn).
  const quote = digest.latestIntention?.text ?? digest.workingOn;
  const quoteIsHerWords = !!digest.latestIntention;
  const quoteDate = digest.latestIntention?.when;

  const hasAnyContent =
    quote || digest.lastSession || digest.nextSession;
  if (!hasAnyContent) return null;

  return (
    <div className="paper-card paper-card--feature p-6 md:p-8 mb-5">
      {/* The pull quote — her voice, large and italic */}
      {quote && (
        <div className="mb-5">
          <blockquote className="font-serif italic text-xl md:text-2xl text-ink-800 leading-snug">
            <span className="text-flame-700">&ldquo;</span>
            {quote}
            <span className="text-flame-700">&rdquo;</span>
          </blockquote>
          <div className="text-[11px] text-ink-500 mt-2 tracking-wide">
            {quoteIsHerWords ? (
              <>
                {firstName} said this{" "}
                {quoteDate && <>· {relativeTime(quoteDate)}</>}
              </>
            ) : (
              <>What you&apos;re holding for {firstName} right now</>
            )}
          </div>
        </div>
      )}

      {/* The two-column page split: where we left off | coming up */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 pt-5 border-t border-ink-200/60">
        {/* LEFT: where we left off */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">
            Where we left off
          </div>
          {digest.lastSession ? (
            <>
              <div className="font-serif text-base text-ink-900">
                {fullDate(digest.lastSession.when)}
              </div>
              <div className="text-xs text-ink-500 mt-0.5">
                {digest.lastSession.type}
                {" · "}
                {relativeTime(digest.lastSession.when)}
              </div>

              {digest.lastSession.intention && !quote && (
                <div className="text-sm text-ink-600 italic mt-2">
                  &ldquo;{digest.lastSession.intention}&rdquo;
                </div>
              )}

              {(digest.lastSession.arrivedAs ||
                digest.lastSession.leftAs) && (
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  {digest.lastSession.arrivedAs && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-400">
                        Arrived
                      </div>
                      <div className="text-ink-700 italic mt-0.5">
                        {digest.lastSession.arrivedAs}
                      </div>
                    </div>
                  )}
                  {digest.lastSession.leftAs && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-400">
                        Left
                      </div>
                      <div className="text-ink-700 italic mt-0.5">
                        {digest.lastSession.leftAs}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {digest.lastSession.notesExcerpt && (
                <p className="text-xs text-ink-600 mt-3 leading-relaxed border-l-2 border-ink-200 pl-3 italic">
                  {digest.lastSession.notesExcerpt}
                </p>
              )}
            </>
          ) : (
            <div className="text-sm text-ink-400 italic">
              No sessions held yet.
            </div>
          )}
        </div>

        {/* RIGHT: coming up */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">
            Coming up
          </div>
          {digest.nextSession ? (
            <>
              <div className="font-serif text-base text-ink-900">
                {fullDate(digest.nextSession.when)}
              </div>
              <div className="text-xs text-ink-500 mt-0.5">
                {shortTime(digest.nextSession.when)}
                {" · "}
                {digest.nextSession.type}
                {" · "}
                {digest.nextSession.durationMinutes}m
              </div>

              {digest.nextSession.meetUrl ? (
                <a
                  href={digest.nextSession.meetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded"
                >
                  Join Meet ↗
                </a>
              ) : (
                <div className="text-xs text-ink-400 italic mt-2">
                  No Meet link yet. Connect Google Calendar in Settings to
                  auto-generate one.
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-ink-400 italic">
              Nothing scheduled.{" "}
              <Link
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.dispatchEvent(
                    new CustomEvent("shortcuts:schedule-session")
                  );
                }}
                className="text-flame-700 hover:underline not-italic"
              >
                Schedule one →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
