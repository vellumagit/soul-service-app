// Practitioner-side groups list. Shows every group Svit has created.
// Tile per group with default capacity/duration/price + a "New group"
// dialog at the top.

import Link from "next/link";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { db } from "@/db";
import { groups, groupSessions } from "@/db/schema";
import { getSettings, listClientsForPicker } from "@/db/queries";
import { asLocale } from "@/lib/i18n";
import { NewGroupDialog } from "@/components/NewGroupDialog";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default async function GroupsPage() {
  const { email, accountId } = await requireSession();

  const [groupsRows, settings, clientsList] = await Promise.all([
    db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        defaultCapacity: groups.defaultCapacity,
        defaultDurationMinutes: groups.defaultDurationMinutes,
        defaultPriceCents: groups.defaultPriceCents,
        defaultCurrency: groups.defaultCurrency,
        published: groups.published,
        upcomingCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${groupSessions}
          WHERE ${groupSessions.groupId} = ${groups.id}
            AND ${groupSessions.status} = 'scheduled'
            AND ${groupSessions.scheduledAt} >= NOW()
        )`,
      })
      .from(groups)
      .where(and(eq(groups.accountId, accountId), isNull(groups.archivedAt)))
      .orderBy(desc(groups.createdAt)),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);

  const locale = asLocale(settings.uiLanguage);

  return (
    <AppShell
      breadcrumb={[{ label: "Circles" }]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={email}
      locale={locale}
      timeZone={settings.timezone}
    >
      <header className="mb-7 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1
            className="text-3xl md:text-4xl text-ink-900 serif mb-1"
            style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
          >
            Circles
          </h1>
          <p className="text-sm text-ink-500 italic serif-italic">
            The Circle and any other circle offerings you hold.
          </p>
        </div>
        <NewGroupDialog />
      </header>

      {groupsRows.length === 0 ? (
        <div className="paper-card p-10 text-center max-w-xl mx-auto">
          <p
            className="serif-italic text-lg text-plum-700 mb-2"
            style={{ fontWeight: 400 }}
          >
            No circles yet.
          </p>
          <p className="text-sm text-ink-500 leading-relaxed">
            Click <strong>New circle</strong> to create The Circle or any
            other recurring circle offering. Once you schedule sessions
            under it, they&apos;ll appear on your storefront for visitors
            to sign up.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          {groupsRows.map((g) => (
            <Link
              key={g.id}
              href={`/groups/${g.id}`}
              className="paper-card p-5 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <h2
                  className="serif text-xl text-ink-900"
                  style={{ fontWeight: 500 }}
                >
                  {g.name}
                </h2>
                {!g.published && (
                  <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-ink-100 text-ink-500">
                    Private
                  </span>
                )}
              </div>
              {g.description && (
                <p className="text-sm text-ink-600 italic mb-3 line-clamp-2">
                  {g.description}
                </p>
              )}
              <div className="text-[12px] text-ink-500 font-mono flex items-center gap-3 flex-wrap mt-3">
                <span>cap {g.defaultCapacity}</span>
                <span>·</span>
                <span>{g.defaultDurationMinutes}min</span>
                <span>·</span>
                <span>
                  {formatMoney(g.defaultPriceCents, g.defaultCurrency)}/session
                </span>
              </div>
              <div className="mt-3 text-[12px] text-plum-700">
                {g.upcomingCount === 0
                  ? "No sessions scheduled"
                  : `${g.upcomingCount} upcoming session${g.upcomingCount === 1 ? "" : "s"}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
