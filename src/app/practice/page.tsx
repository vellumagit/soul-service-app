// "Your year" — the annual digest of her practice.
//
// Pulls everything she's quietly accumulated through the year: closings,
// milestones, themes, anniversaries, new beginnings, monthly rhythm. Reads
// like a year-end letter, not a stats dashboard.
//
// URL: /practice — optional ?year=2025 to look at past years.
//
// This is the payoff of the Arc cluster. The Closing's "never want to
// forget" lines become the anchor moments here. The Milestone labels
// become the named ledger. The Birthdays + anniversaries from Warmth
// feed the relational warmth sections.

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import {
  getYearInReview,
  getSettings,
  listClientsForPicker,
} from "@/db/queries";
import { fullDate } from "@/lib/format";
import { resolveTimeZone } from "@/lib/timezone";
import { asLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { email, accountId } = await requireSession();
  const { year: yearParam } = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = (() => {
    if (!yearParam) return thisYear;
    const n = parseInt(yearParam, 10);
    if (!Number.isFinite(n)) return thisYear;
    // Don't go absurdly far back; cap at 2020 for sanity, and at this year
    // for the future bound.
    return Math.max(2020, Math.min(n, thisYear));
  })();

  const [review, settings, clients] = await Promise.all([
    getYearInReview(accountId, year),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);
  const locale = asLocale(settings.uiLanguage);
  const practiceTz = resolveTimeZone(settings.timezone);
  const hours = Math.round((review.totalMinutes / 60) * 10) / 10;
  const empty =
    review.sessionsHeld === 0 &&
    review.milestones.length === 0 &&
    review.anchorMoments.length === 0;

  return (
    <AppShell
      breadcrumb={[
        { label: "Your practice", href: "/practice" },
        { label: String(year) },
      ]}
      rightAction={<QuickActions clients={clients} />}
      userEmail={email}
      locale={locale}
      timeZone={settings.timezone}
    >
      {/* Header — year picker + tagline */}
      <header className="mb-8">
        <div className="flex items-baseline gap-3 flex-wrap mb-2">
          <h1
            className="text-3xl md:text-4xl text-ink-900 serif"
            style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
          >
            Your year
          </h1>
          <YearSwitcher year={year} thisYear={thisYear} />
        </div>
        <p className="text-sm text-ink-500 italic serif-italic">
          What you held, who you saw, what kept coming up.
        </p>
      </header>

      {empty ? (
        <div className="paper-card p-12 text-center text-sm text-ink-500">
          Nothing held in {year} yet. Come back when there&apos;s an arc to
          show.
        </div>
      ) : (
        <div className="space-y-8 max-w-3xl">
          {/* Hero — the bare math, read as a sentence */}
          <section className="paper-card paper-card--feature p-6 md:p-8">
            <p
              className="serif-italic text-xl md:text-2xl text-ink-800 leading-relaxed"
              style={{ fontWeight: 400 }}
            >
              In {year} you held{" "}
              <strong className="text-plum-700 not-italic">
                {review.sessionsHeld}
              </strong>{" "}
              session{review.sessionsHeld === 1 ? "" : "s"} with{" "}
              <strong className="text-plum-700 not-italic">
                {review.clientsSeen}
              </strong>{" "}
              {review.clientsSeen === 1 ? "person" : "people"}.
              {hours > 0 && (
                <>
                  {" "}
                  That&apos;s about{" "}
                  <strong className="text-plum-700 not-italic">{hours}</strong>{" "}
                  hour{hours === 1 ? "" : "s"} of held time, across{" "}
                  <strong className="text-plum-700 not-italic">
                    {review.monthsActive}
                  </strong>{" "}
                  month{review.monthsActive === 1 ? "" : "s"}.
                </>
              )}
            </p>
          </section>

          {/* Anchor moments — closingNeverForget lines, the precious threads */}
          {review.anchorMoments.length > 0 && (
            <section className="paper-card p-6">
              <h2
                className="serif-italic text-xl text-plum-700 mb-1"
                style={{ fontWeight: 400 }}
              >
                Lines you didn&apos;t want to forget
              </h2>
              <p className="text-xs text-ink-500 italic mb-5">
                {review.anchorMoments.length}{" "}
                {review.anchorMoments.length === 1 ? "moment" : "moments"} from
                The Closing.
              </p>
              <ul className="space-y-4">
                {review.anchorMoments.map((m) => (
                  <li
                    key={m.sessionId}
                    className="border-l-2 border-honey-300 pl-4"
                  >
                    <p
                      className="serif-italic text-base text-ink-800 leading-relaxed"
                      style={{ fontWeight: 400 }}
                    >
                      &ldquo;{m.line}&rdquo;
                    </p>
                    <p className="text-[11px] text-ink-500 mt-1.5">
                      —{" "}
                      <Link
                        href={`/clients/${m.clientId}?tab=sessions#${m.sessionId}`}
                        className="hover:text-plum-700 hover:underline"
                      >
                        {m.clientName}
                      </Link>
                      <span className="text-ink-300 mx-1.5">·</span>
                      {fullDate(m.sessionAt, practiceTz)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Milestones — the named anchors */}
          {review.milestones.length > 0 && (
            <section className="paper-card p-6">
              <h2
                className="serif-italic text-xl text-plum-700 mb-1"
                style={{ fontWeight: 400 }}
              >
                Milestones
              </h2>
              <p className="text-xs text-ink-500 italic mb-5">
                {review.milestones.length}{" "}
                {review.milestones.length === 1 ? "moment" : "moments"} you
                named.
              </p>
              <ul className="space-y-3">
                {review.milestones.map((m) => (
                  <li
                    key={m.sessionId}
                    className="flex items-baseline gap-3 text-sm flex-wrap"
                  >
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium shrink-0"
                      style={{
                        background: "var(--color-honey-50)",
                        color: "var(--color-honey-700)",
                        border: "1px solid var(--color-honey-100)",
                      }}
                    >
                      <span aria-hidden="true">◆</span>
                      {m.label}
                    </span>
                    <Link
                      href={`/clients/${m.clientId}?tab=sessions#${m.sessionId}`}
                      className="text-ink-700 hover:text-plum-700 hover:underline"
                    >
                      {m.clientName}
                    </Link>
                    <span className="text-ink-400 text-xs">
                      · {fullDate(m.sessionAt, practiceTz)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Themes that kept coming up */}
          {review.topThemes.length > 0 && (
            <section className="paper-card p-6">
              <h2
                className="serif-italic text-xl text-plum-700 mb-1"
                style={{ fontWeight: 400 }}
              >
                What kept coming up
              </h2>
              <p className="text-xs text-ink-500 italic mb-4">
                Themes across all your clients this year.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {review.topThemes.map((th) => (
                  <span
                    key={th.label}
                    className="chip bg-plum-50 text-plum-700"
                    title={`${th.count} client${th.count === 1 ? "" : "s"}`}
                  >
                    {th.label}
                    <span className="text-plum-300 font-mono text-[10px] ml-1">
                      {th.count}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* New beginnings + anniversaries — the relational warmth */}
          {(review.newBeginnings.length > 0 ||
            review.anniversariesPassed.length > 0) && (
            <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {review.newBeginnings.length > 0 && (
                <div className="paper-card p-6">
                  <h2
                    className="serif-italic text-base text-plum-700 mb-1"
                    style={{ fontWeight: 400 }}
                  >
                    New beginnings
                  </h2>
                  <p className="text-[11px] text-ink-500 italic mb-3">
                    People who walked in for the first time this year.
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {review.newBeginnings.map((b) => (
                      <li key={b.clientId}>
                        <Link
                          href={`/clients/${b.clientId}`}
                          className="text-ink-800 hover:text-plum-700 hover:underline"
                        >
                          {b.clientName}
                        </Link>
                        <span className="text-ink-400 text-[11px]">
                          {" "}
                          · {fullDate(b.firstAt, practiceTz)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {review.anniversariesPassed.length > 0 && (
                <div className="paper-card p-6">
                  <h2
                    className="serif-italic text-base text-plum-700 mb-1"
                    style={{ fontWeight: 400 }}
                  >
                    Years crossed
                  </h2>
                  <p className="text-[11px] text-ink-500 italic mb-3">
                    Clients whose anniversary fell in {year}.
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {review.anniversariesPassed.map((a) => (
                      <li key={a.clientId}>
                        <Link
                          href={`/clients/${a.clientId}`}
                          className="text-ink-800 hover:text-plum-700 hover:underline"
                        >
                          {a.clientName}
                        </Link>
                        <span className="text-ink-500 text-[12px]">
                          {" "}
                          · {a.yearsTogether}{" "}
                          {a.yearsTogether === 1 ? "year" : "years"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Monthly rhythm — a small bar chart, no axes, just shape */}
          <section className="paper-card p-6">
            <h2
              className="serif-italic text-base text-plum-700 mb-3"
              style={{ fontWeight: 400 }}
            >
              The rhythm of your year
            </h2>
            <MonthlyRhythm counts={review.monthlyRhythm} />
          </section>
        </div>
      )}
    </AppShell>
  );
}

function YearSwitcher({
  year,
  thisYear,
}: {
  year: number;
  thisYear: number;
}) {
  const options: number[] = [];
  for (let y = thisYear; y >= 2020; y--) options.push(y);
  return (
    <div className="flex items-center gap-1 border border-ink-200 rounded-md overflow-hidden text-xs">
      {options.map((y) => (
        <Link
          key={y}
          href={`/practice?year=${y}`}
          data-active={y === year}
          className="px-2.5 py-1 font-mono text-ink-500 hover:bg-ink-50 data-[active=true]:bg-ink-900 data-[active=true]:text-white"
        >
          {y}
        </Link>
      ))}
    </div>
  );
}

function MonthlyRhythm({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return (
    <div className="flex items-end gap-1.5 h-24">
      {counts.map((c, i) => {
        const heightPercent = (c / max) * 100;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${months[i]}: ${c} session${c === 1 ? "" : "s"}`}
          >
            <div className="flex-1 w-full flex items-end">
              <div
                className="w-full rounded-t-sm"
                style={{
                  height: c > 0 ? `${Math.max(2, heightPercent)}%` : 1,
                  background:
                    c > 0 ? "var(--color-plum-500)" : "var(--color-ink-100)",
                }}
              />
            </div>
            <div className="text-[9px] font-mono text-ink-400">{months[i]}</div>
          </div>
        );
      })}
    </div>
  );
}
