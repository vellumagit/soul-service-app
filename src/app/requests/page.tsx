// /requests — the hub.
//
// This page used to render all ten kinds of pending thing stacked into one
// scroll: reschedules, then bookings, then refunds, then sign-ups, then
// purchases, then five categories of her own backlog. Even with three items
// in it, it read as one undifferentiated pile — you had to scroll the whole
// thing to find out what was in it, and nothing felt finishable.
//
// Now it's a set of cards. Each card is one kind of thing, with its count,
// and opens /requests/<slug> where only that kind is listed. Two groups,
// and the split matters:
//
//   Waiting on you  — a PERSON is blocked. These drive the sidebar count.
//   Your threads    — your own unfinished work. Nobody is blocked; these
//                     never touch the badge, so it can still reach zero.
//
// Sections with nothing in them aren't rendered at all — an empty card is
// just another thing to read past.

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { getLooseEnds, getSettings, listClientsForPicker } from "@/db/queries";
import { asLocale } from "@/lib/i18n";
import {
  REQUEST_SECTIONS,
  countWaiting,
  type RequestGroup,
} from "@/lib/request-sections";

export const dynamic = "force-dynamic";

export default async function RequestsHubPage() {
  const { email, accountId } = await requireSession();

  const [ends, settings, clients] = await Promise.all([
    getLooseEnds(accountId),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);
  const locale = asLocale(settings.uiLanguage);

  const live = REQUEST_SECTIONS.map((s) => ({ ...s, n: s.count(ends) })).filter(
    (s) => s.n > 0
  );
  const waiting = live.filter((s) => s.group === "waiting");
  const threads = live.filter((s) => s.group === "threads");
  const waitingCount = countWaiting(ends);

  return (
    <AppShell
      breadcrumb={[{ label: "Requests" }]}
      rightAction={<QuickActions clients={clients} />}
      userEmail={email}
      locale={locale}
      timeZone={settings.timezone}
    >
      <header className="mb-8 max-w-3xl">
        <h1
          className="text-3xl md:text-4xl text-ink-900 serif mb-2"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          Requests
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          {live.length === 0
            ? "Nothing waiting. The work is clean."
            : waitingCount > 0
              ? `${waitingCount} ${waitingCount === 1 ? "person is" : "people are"} waiting on you.`
              : "Nobody is waiting. A few of your own threads are open."}
        </p>
      </header>

      {live.length === 0 ? (
        <div className="paper-card p-12 text-center max-w-2xl">
          <div
            className="serif-italic text-lg text-plum-700 mb-2"
            style={{ fontWeight: 400 }}
          >
            All clear.
          </div>
          <p className="text-sm text-ink-500 leading-relaxed">
            Nobody is waiting on you. Every completed session has notes, a
            closing and a payment marked, and every upcoming one has an
            intention. Come back when something needs you — it&apos;ll be
            here.
          </p>
        </div>
      ) : (
        <div className="space-y-10 max-w-3xl">
          {waiting.length > 0 && (
            <CardGroup
              label="Waiting on you"
              hint="Someone asked and hasn't heard back."
              sections={waiting}
              tone="waiting"
            />
          )}
          {threads.length > 0 && (
            <CardGroup
              label="Your own threads"
              hint="Nobody is blocked on these. For a quiet moment."
              sections={threads}
              tone="threads"
            />
          )}
        </div>
      )}
    </AppShell>
  );
}

function CardGroup({
  label,
  hint,
  sections,
  tone,
}: {
  label: string;
  hint: string;
  sections: Array<{ slug: string; title: string; blurb: string; n: number }>;
  tone: RequestGroup;
}) {
  const isWaiting = tone === "waiting";
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-[10px] uppercase tracking-widest text-honey-700 font-mono">
          {label}
        </h2>
        <p className="text-[12px] text-ink-500 italic mt-0.5">{hint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.slug}
            href={`/requests/${s.slug}`}
            className="paper-card p-5 block transition-colors hover:bg-ink-50 group"
            style={
              isWaiting
                ? {
                    background: "var(--color-honey-50)",
                    border: "1px solid var(--color-honey-100)",
                  }
                : undefined
            }
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <p
                className="text-base text-ink-900 serif"
                style={{ fontWeight: 500, letterSpacing: "-0.01em" }}
              >
                {s.title}
              </p>
              <span
                className="shrink-0 min-w-[22px] h-[22px] px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-mono"
                style={{
                  background: isWaiting
                    ? "var(--color-honey-700, #b05c36)"
                    : "var(--color-ink-100, #e7e0d6)",
                  color: isWaiting ? "#fff" : "var(--color-ink-700, #564a42)",
                }}
              >
                {s.n}
              </span>
            </div>
            <p className="text-[12px] text-ink-600 leading-relaxed">
              {s.blurb}
            </p>
            <p className="text-[12px] text-plum-700 mt-2 group-hover:underline">
              Open →
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
