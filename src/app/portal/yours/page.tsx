// "Yours" — everything the client has booked and hasn't happened yet, their
// own 1-on-1 sessions and any Circle seat they hold, in one time-ordered list.
//
// Before this, a client who'd signed up for a Circle saw no trace of it
// anywhere in their portal — the portal only ever knew about 1-on-1s. Their
// calendar with this practitioner was split across two places, one of which
// they couldn't see.

import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { getBookedForClient } from "@/lib/portal-circles";
import { getPortalTimeZone } from "@/lib/portal-timezone";
import { fullDate, shortTime, zoneAbbrev } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalYoursPage() {
  const portal = await requirePortalSession();
  const [items, { timeZone, hasOwnZone }] = await Promise.all([
    getBookedForClient(
      portal.accountId,
      portal.clientId,
      portal.clientEmail
    ),
    getPortalTimeZone(portal.accountId, portal.clientId),
  ]);

  const now = new Date();
  const zone = zoneAbbrev(now, timeZone);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <header className="mb-7">
        <h1
          className="text-2xl md:text-3xl text-ink-900 serif mb-1"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          Yours
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          Everything you have booked — sessions and Circles together.
          {zone && (
            <>
              {" "}
              All times {zone}
              {!hasOwnZone && " (her time)"}.
            </>
          )}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="paper-card p-10 text-center">
          <p
            className="serif-italic text-base text-plum-700 mb-1"
            style={{ fontWeight: 400 }}
          >
            Nothing booked right now.
          </p>
          <p className="text-sm text-ink-500 italic mb-4 leading-relaxed">
            When something is on the calendar — a session or a Circle — it
            will show up here.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href="/portal/book"
              className="inline-block px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
            >
              Ask for a session →
            </Link>
            <Link
              href="/portal/whats-on"
              className="inline-block px-4 py-2 text-sm rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors"
            >
              See what&apos;s on →
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const minutesUntil =
              (item.scheduledAt.getTime() - now.getTime()) / (60 * 1000);
            const hasStarted = minutesUntil <= 0;
            const joinable =
              !!item.meetUrl &&
              minutesUntil <= 30 &&
              minutesUntil >= -item.durationMinutes;

            return (
              <li
                key={`${item.kind}-${item.href}`}
                className="paper-card p-5 md:p-6"
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                  <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono">
                    {hasStarted
                      ? "Happening now"
                      : item.kind === "circle"
                        ? "Circle"
                        : "Session"}
                  </p>
                  {item.pending && (
                    <span className="text-[10px] uppercase tracking-widest text-plum-700 font-mono">
                      Seat not confirmed
                    </span>
                  )}
                </div>
                <p
                  className="text-lg text-ink-900 serif mb-1"
                  style={{ fontWeight: 500, letterSpacing: "-0.01em" }}
                >
                  {item.title}
                </p>
                <p className="text-sm text-ink-600 mb-3">
                  {fullDate(item.scheduledAt, timeZone)} ·{" "}
                  {shortTime(item.scheduledAt, timeZone)} ·{" "}
                  {item.durationMinutes} min
                </p>

                {item.pending && (
                  <p className="text-[12px] text-ink-500 italic mb-3 leading-relaxed">
                    Your seat is held but not confirmed yet — open the Circle
                    to finish.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {item.meetUrl && (
                    <a
                      href={item.meetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
                        joinable
                          ? "bg-plum-700 hover:bg-plum-600 text-white"
                          : "bg-ink-50 text-ink-700 hover:bg-ink-100 border border-ink-200"
                      }`}
                    >
                      {joinable
                        ? hasStarted
                          ? "Join — she's waiting →"
                          : "Join now →"
                        : "Open the link"}
                    </a>
                  )}
                  <Link
                    href={item.href}
                    className="px-4 py-2 text-sm rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors"
                  >
                    {item.kind === "circle" ? "About this Circle" : "Details"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
