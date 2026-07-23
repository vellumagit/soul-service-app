// /network — a light contact-book of people orbiting her practice.
//
// People she's met but hasn't held a session with yet. Everyone here has
// `clients.is_lead = true`. They live in the same table as clients (one
// record per person), but they're filtered out of /clients until a first
// session promotes them.
//
// What it shows:
//   - A list of every lead with avatar, name, source (how/where she met
//     them), met-on date, optional "referred by" link, last-touched
//     timestamp, and lightweight tags/working-on snippets.
//   - Filter chips: all / recent / no-source / warm.
//   - "+ Add someone" button → AddLeadDialog (lightweight quick-add).
//   - Empty state explaining what this is, on a parchment card.

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AddLeadDialog } from "@/components/AddLeadDialog";
import { QuickActions } from "@/components/QuickActions";
import {
  listNetwork,
  listClientsForPicker,
  getSettings,
  getLeadInboxCount,
} from "@/db/queries";
import type { NetworkFilter } from "@/db/queries";
import { initials, relativeTime, shortDate } from "@/lib/format";
import { resolveTimeZone } from "@/lib/timezone";
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const FILTERS: {
  value: NetworkFilter;
  label: string;
  description: string;
}[] = [
  {
    value: "all",
    label: "All",
    description: "Everyone in your network",
  },
  {
    value: "recent",
    label: "Recent",
    description: "Added in the last 30 days",
  },
  {
    value: "warm",
    label: "Warm",
    description: "People you've written something about",
  },
  {
    value: "no-source",
    label: "Missing source",
    description: "No 'where we met' set yet",
  },
];

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { email, accountId } = await requireSession();
  const { filter: filterRaw = "all" } = await searchParams;
  const filter = (
    FILTERS.some((f) => f.value === filterRaw) ? filterRaw : "all"
  ) as NetworkFilter;

  const [network, picker, settings, inboxCount] = await Promise.all([
    listNetwork(accountId, filter),
    listClientsForPicker(accountId),
    getSettings(accountId),
    getLeadInboxCount(accountId),
  ]);
  const locale = asLocale(settings.uiLanguage);
  const practiceTz = resolveTimeZone(settings.timezone);

  return (
    <AppShell
      breadcrumb={[
        { label: t(locale, "nav.network"), href: "/network" },
        {
          label:
            FILTERS.find((f) => f.value === filter)?.label ?? "Everyone",
        },
      ]}
      rightAction={<QuickActions clients={picker} />}
      userEmail={email}
      locale={locale}
      timeZone={settings.timezone}
    >
      <header className="mb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-2">
          <div>
            <h1
              className="text-3xl text-ink-900 serif"
              style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
            >
              Your network
            </h1>
            <p className="text-sm text-ink-500 italic serif-italic mt-1">
              People you&apos;ve met. Where they came from, what you noticed.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {inboxCount > 0 && (
              <Link
                href="/network/inbox"
                className="chip bg-honey-50 text-honey-700 hover:bg-honey-100"
                title="Pending submissions from your lead capture forms"
              >
                ✦ {inboxCount} in inbox
              </Link>
            )}
            <Link
              href="/network/forms"
              className="text-xs text-ink-500 hover:text-ink-900"
              title="Manage lead capture forms"
            >
              Forms →
            </Link>
            <AddLeadDialog
              referrerOptions={picker.map((p) => ({
                id: p.id,
                fullName: p.fullName,
              }))}
            />
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={
              f.value === "all" ? "/network" : `/network?filter=${f.value}`
            }
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
              filter === f.value
                ? "bg-ink-900 text-white"
                : "bg-white border border-ink-200 text-ink-700 hover:bg-ink-50"
            }`}
            title={f.description}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {network.length === 0 ? (
        <div className="paper-card p-10 text-center max-w-xl mx-auto">
          <h2
            className="serif-italic text-xl text-plum-700 mb-2"
            style={{ fontWeight: 400 }}
          >
            {filter === "all"
              ? "No one in your network yet."
              : "No matches with this filter."}
          </h2>
          <p className="text-sm text-ink-600 leading-relaxed mb-5">
            {filter === "all" ? (
              <>
                For people you&apos;ve met but haven&apos;t held a session with
                yet — a workshop friend, a referral, someone who reached out
                on Instagram. Jot them down so you don&apos;t lose the thread.
                <br />
                <span className="text-ink-500 text-xs italic mt-3 block">
                  When you eventually schedule their first session, they
                  quietly move into your clients.
                </span>
              </>
            ) : (
              <>
                Try a different filter, or{" "}
                <Link href="/network" className="text-plum-700 underline">
                  see everyone
                </Link>
                .
              </>
            )}
          </p>
          {filter === "all" && (
            <AddLeadDialog
              referrerOptions={picker.map((p) => ({
                id: p.id,
                fullName: p.fullName,
              }))}
            />
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {network.map((p) => (
            <li
              key={p.id}
              className="paper-card p-3.5 md:p-4 flex items-start gap-3.5"
            >
              <Avatar
                fullName={p.fullName}
                avatarUrl={p.avatarUrl}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <Link
                    href={`/clients/${p.id}`}
                    className="font-medium text-ink-900 hover:text-plum-700 hover:underline"
                  >
                    {p.fullName}
                  </Link>
                  {p.notesCount > 0 && (
                    <span
                      className="text-[10px] font-mono text-honey-700"
                      title={`${p.notesCount} note${
                        p.notesCount === 1 ? "" : "s"
                      } / task${p.notesCount === 1 ? "" : "s"}`}
                    >
                      ✦ warm
                    </span>
                  )}
                  {p.workingOn && (
                    <span className="text-xs text-ink-500 truncate">
                      · {p.workingOn}
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {p.source ? (
                    <span title="Where you met">
                      <span className="text-ink-400">From:</span>{" "}
                      <span className="text-ink-700">{p.source}</span>
                    </span>
                  ) : (
                    <span className="text-ink-300 italic">
                      No source noted
                    </span>
                  )}
                  {p.metViaClientName && (
                    <span title="Referred by">
                      <span className="text-ink-400">via</span>{" "}
                      <Link
                        href={`/clients/${p.metViaClientId}`}
                        className="text-plum-700 hover:underline"
                      >
                        {p.metViaClientName}
                      </Link>
                    </span>
                  )}
                  {p.metOn && (
                    <span title="When you met">
                      <span className="text-ink-400">met</span>{" "}
                      <span className="text-ink-700 font-mono">
                        {shortDate(p.metOn, practiceTz)}
                      </span>
                    </span>
                  )}
                </div>
                {(p.email || p.phone) && (
                  <div className="text-[11px] text-ink-500 mt-1.5 flex flex-wrap gap-x-3">
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="hover:text-plum-700"
                      >
                        {p.email}
                      </a>
                    )}
                    {p.phone && <span className="font-mono">{p.phone}</span>}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0 text-[11px] text-ink-400 font-mono">
                {p.lastTouchedAt && relativeTime(p.lastTouchedAt)}
                <div className="mt-1">
                  <Link
                    href={`/clients/${p.id}`}
                    className="text-plum-700 hover:underline text-xs"
                  >
                    Open →
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function Avatar({
  fullName,
  avatarUrl,
  size,
}: {
  fullName: string;
  avatarUrl: string | null;
  size: number;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={fullName}
        width={size}
        height={size}
        className="rounded-md object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-md bg-plum-100 text-plum-700 flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.35),
      }}
    >
      {initials(fullName)}
    </div>
  );
}
