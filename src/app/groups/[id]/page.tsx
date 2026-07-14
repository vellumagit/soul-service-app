// Practitioner-side single group detail. Shows the group's defaults, a
// list of upcoming and past sessions, and per-session attendee triage.

import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { db } from "@/db";
import { groups, groupSessions, groupAttendees } from "@/db/schema";
import { getSettings, listClientsForPicker } from "@/db/queries";
import { asLocale } from "@/lib/i18n";
import { ScheduleGroupSessionDialog } from "@/components/ScheduleGroupSessionDialog";
import { GroupAttendeeRow } from "@/components/GroupAttendeeRow";
import { CancelGroupSessionButton } from "@/components/CancelGroupSessionButton";
import { GroupRecurrencePanel } from "@/components/GroupRecurrencePanel";
import { EditGroupDialog } from "@/components/EditGroupDialog";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatWhen(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { email, accountId } = await requireSession();
  const { id } = await params;

  const [groupRow, settings, clientsList] = await Promise.all([
    db
      .select()
      .from(groups)
      .where(and(eq(groups.accountId, accountId), eq(groups.id, id)))
      .limit(1),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);

  const group = groupRow[0];
  if (!group) notFound();

  const locale = asLocale(settings.uiLanguage);

  const sessionRows = await db
    .select({
      id: groupSessions.id,
      scheduledAt: groupSessions.scheduledAt,
      durationMinutes: groupSessions.durationMinutes,
      capacity: groupSessions.capacity,
      priceCents: groupSessions.priceCents,
      topic: groupSessions.topic,
      status: groupSessions.status,
      meetUrl: groupSessions.meetUrl,
      attendeeCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${groupAttendees}
        WHERE ${groupAttendees.groupSessionId} = ${groupSessions.id}
          AND ${groupAttendees.status} <> 'cancelled'
      )`,
      paidCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${groupAttendees}
        WHERE ${groupAttendees.groupSessionId} = ${groupSessions.id}
          AND ${groupAttendees.paid} = TRUE
      )`,
    })
    .from(groupSessions)
    .where(eq(groupSessions.groupId, group.id))
    .orderBy(desc(groupSessions.scheduledAt));

  const sessionIds = sessionRows.map((s) => s.id);
  const allAttendees =
    sessionIds.length > 0
      ? await db
          .select()
          .from(groupAttendees)
          .where(inArray(groupAttendees.groupSessionId, sessionIds))
          .orderBy(desc(groupAttendees.createdAt))
      : [];

  const attendeesBySession = new Map<string, typeof allAttendees>();
  for (const a of allAttendees) {
    const list = attendeesBySession.get(a.groupSessionId) ?? [];
    list.push(a);
    attendeesBySession.set(a.groupSessionId, list);
  }

  const now = Date.now();
  const upcoming = sessionRows.filter(
    (s) =>
      s.status === "scheduled" && new Date(s.scheduledAt).getTime() >= now
  );
  const past = sessionRows.filter(
    (s) =>
      s.status !== "scheduled" || new Date(s.scheduledAt).getTime() < now
  );

  return (
    <AppShell
      breadcrumb={[
        { label: "Groups", href: "/groups" },
        { label: group.name },
      ]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={email}
      locale={locale}
    >
      <header className="mb-7 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1
            className="text-3xl md:text-4xl text-ink-900 serif mb-1"
            style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
          >
            {group.name}
            {!group.published && (
              <span className="ml-3 align-middle text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-ink-100 text-ink-500">
                Private
              </span>
            )}
          </h1>
          {group.description && (
            <p className="text-sm text-ink-600 italic serif-italic mt-1 max-w-2xl">
              {group.description}
            </p>
          )}
          <div className="text-[12px] text-ink-500 font-mono flex items-center gap-3 flex-wrap mt-3">
            <span>cap {group.defaultCapacity}</span>
            <span>·</span>
            <span>{group.defaultDurationMinutes}min</span>
            <span>·</span>
            <span>
              {formatMoney(group.defaultPriceCents, group.defaultCurrency)}/seat
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EditGroupDialog
            group={{
              id: group.id,
              name: group.name,
              description: group.description,
              defaultCapacity: group.defaultCapacity,
              defaultDurationMinutes: group.defaultDurationMinutes,
              defaultPriceCents: group.defaultPriceCents,
              defaultCurrency: group.defaultCurrency,
              paymentInstructions: group.paymentInstructions,
              published: group.published,
            }}
          />
          <ScheduleGroupSessionDialog
            groupId={group.id}
            groupName={group.name}
            defaultDurationMinutes={group.defaultDurationMinutes}
            defaultCapacity={group.defaultCapacity}
          />
        </div>
      </header>

      {group.published && (
        <GroupRecurrencePanel
          groupId={group.id}
          enabled={group.recurrenceEnabled}
          weekday={group.recurrenceWeekday}
          time={group.recurrenceTime}
        />
      )}

      {group.paymentInstructions && (
        <div className="paper-card p-4 mb-7 max-w-2xl">
          <div className="text-[10px] uppercase tracking-wider font-mono text-ink-500 mb-1">
            Payment instructions (shown to attendees)
          </div>
          <p className="text-sm text-ink-700 whitespace-pre-wrap">
            {group.paymentInstructions}
          </p>
        </div>
      )}

      <section className="mb-10">
        <h2
          className="serif text-xl text-ink-900 mb-3"
          style={{ fontWeight: 500 }}
        >
          Upcoming sessions
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-500 italic">
            None scheduled. Click <strong>Schedule session</strong> above to
            add one.
          </p>
        ) : (
          <div className="space-y-6">
            {upcoming.map((s) => {
              const attendees = attendeesBySession.get(s.id) ?? [];
              const pending = attendees.filter(
                (a) => a.status === "pending"
              );
              const confirmed = attendees.filter(
                (a) => a.status === "confirmed"
              );
              return (
                <article key={s.id} className="paper-card p-5">
                  <header className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                    <div>
                      <h3
                        className="serif text-lg text-ink-900"
                        style={{ fontWeight: 500 }}
                      >
                        {formatWhen(new Date(s.scheduledAt), locale)}
                      </h3>
                      <div className="text-[12px] text-ink-500 font-mono mt-1 flex items-center gap-2 flex-wrap">
                        <span>{s.durationMinutes}min</span>
                        <span>·</span>
                        <span>
                          {s.attendeeCount}/{s.capacity} spots
                        </span>
                        <span>·</span>
                        <span>
                          {s.paidCount}/{s.attendeeCount} paid
                        </span>
                        {s.topic && (
                          <>
                            <span>·</span>
                            <span className="italic text-plum-700 not-italic">
                              {s.topic}
                            </span>
                          </>
                        )}
                      </div>
                      {s.meetUrl && (
                        <a
                          href={s.meetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12px] text-plum-700 hover:underline mt-1 inline-block break-all"
                        >
                          {s.meetUrl}
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Link
                        href={`/circles/${s.id}`}
                        target="_blank"
                        className="text-[11px] text-plum-700 hover:underline"
                      >
                        Public signup link →
                      </Link>
                      <CancelGroupSessionButton
                        sessionId={s.id}
                        scheduledAtLabel={formatWhen(
                          new Date(s.scheduledAt),
                          locale
                        )}
                      />
                    </div>
                  </header>

                  {attendees.length === 0 ? (
                    <p className="text-xs text-ink-500 italic mt-3">
                      No sign-ups yet. Share the public link to start.
                    </p>
                  ) : (
                    <div className="space-y-2 mt-3">
                      {pending.length > 0 && (
                        <>
                          <div className="text-[10px] uppercase tracking-wider font-mono text-honey-700">
                            Awaiting confirmation
                          </div>
                          {pending.map((a) => (
                            <GroupAttendeeRow
                              key={a.id}
                              attendee={{
                                ...a,
                                createdAt: new Date(a.createdAt),
                                paidAt: a.paidAt
                                  ? new Date(a.paidAt)
                                  : null,
                              }}
                            />
                          ))}
                        </>
                      )}
                      {confirmed.length > 0 && (
                        <>
                          <div className="text-[10px] uppercase tracking-wider font-mono text-sage-700 mt-3">
                            Confirmed
                          </div>
                          {confirmed.map((a) => (
                            <GroupAttendeeRow
                              key={a.id}
                              attendee={{
                                ...a,
                                createdAt: new Date(a.createdAt),
                                paidAt: a.paidAt
                                  ? new Date(a.paidAt)
                                  : null,
                              }}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2
            className="serif text-xl text-ink-900 mb-3"
            style={{ fontWeight: 500 }}
          >
            Past sessions
          </h2>
          <div className="space-y-2">
            {past.map((s) => (
              <div
                key={s.id}
                className="paper-card p-4 flex items-baseline justify-between gap-3 flex-wrap"
              >
                <div>
                  <div
                    className="serif text-base text-ink-700"
                    style={{ fontWeight: 500 }}
                  >
                    {formatWhen(new Date(s.scheduledAt), locale)}
                    {s.status === "cancelled" && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">
                        cancelled
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-500 font-mono mt-0.5">
                    {s.attendeeCount} signed up · {s.paidCount} paid
                    {s.topic && (
                      <>
                        <span> · </span>
                        <span className="italic">{s.topic}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
