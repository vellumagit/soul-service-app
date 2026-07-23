// Practitioner-side single group detail. Shows the group's defaults, a
// list of upcoming and past sessions, and per-session attendee triage.

import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { db } from "@/db";
import {
  groups,
  groupSessions,
  groupAttendees,
  clients,
  sessions,
} from "@/db/schema";
import { getSettings, listClientsForPicker } from "@/db/queries";
import { asLocale } from "@/lib/i18n";
import { resolveTimeZone } from "@/lib/timezone";
import { ScheduleGroupSessionDialog } from "@/components/ScheduleGroupSessionDialog";
import { GroupAttendeeRow } from "@/components/GroupAttendeeRow";
import { CancelGroupSessionButton } from "@/components/CancelGroupSessionButton";
import { GroupRecurrencePanel } from "@/components/GroupRecurrencePanel";
import { AddCircleAttendeeInline } from "@/components/AddCircleAttendeeInline";
import { EditGroupDialog } from "@/components/EditGroupDialog";
import { resolveCircleMeetingUrl } from "@/lib/circle-fulfillment";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatWhen(d: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
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
  const practiceTz = resolveTimeZone(settings.timezone);

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
          AND ${groupAttendees.refundedAt} IS NULL
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
  // Newest first — the most recent circle is the one she'd look for.
  const pastSorted = [...past].sort(
    (a, b) =>
      new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );
  // "Held" = actually gathered people. Everything else (cancelled, or nobody
  // signed up) is noise that shouldn't inflate the headline count.
  const pastHeld = past.filter(
    (s) => s.status !== "cancelled" && s.attendeeCount > 0
  );
  const pastQuiet = past.filter(
    (s) => s.status === "cancelled" || s.attendeeCount === 0
  );

  // Soonest first — the next Circle is the one she actually runs. (The base
  // query is newest-first, which is right for history and backwards for
  // what's coming.)
  const upcomingSorted = [...upcoming].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
  const nextUp = upcomingSorted[0] ?? null;
  const laterUp = upcomingSorted.slice(1);

  // Everyone waiting on her across every upcoming session — surfaced in the
  // header so she doesn't have to scroll each session to find out.
  const pendingTotal = upcomingSorted.reduce(
    (n, s) =>
      n +
      (attendeesBySession.get(s.id)?.filter((a) => a.status === "pending")
        .length ?? 0),
    0
  );

  // ── People: the same person across every session of this Circle ─────────
  // Attendance lives per-session, so "who are my regulars?" was unanswerable.
  // Folded here from data already loaded — no extra query.
  const priceBySession = new Map(sessionRows.map((s) => [s.id, s.priceCents]));
  const whenBySession = new Map(
    sessionRows.map((s) => [s.id, new Date(s.scheduledAt).getTime()])
  );
  type Person = {
    name: string;
    email: string;
    attended: number;
    paidCents: number;
    lastAt: number | null;
    coming: boolean;
  };
  const peopleMap = new Map<string, Person>();
  for (const a of allAttendees) {
    if (a.status === "cancelled") continue;
    const email = (a.email ?? "").trim().toLowerCase();
    const key = email || `name:${(a.name ?? "").trim().toLowerCase()}`;
    if (!key) continue;
    const when = whenBySession.get(a.groupSessionId) ?? 0;
    const p: Person = peopleMap.get(key) ?? {
      name: a.name ?? "",
      email: a.email ?? "",
      attended: 0,
      paidCents: 0,
      lastAt: null,
      coming: false,
    };
    if (a.name) p.name = a.name;
    if (when < now) {
      p.attended += 1;
      p.lastAt = Math.max(p.lastAt ?? 0, when);
    } else {
      p.coming = true;
    }
    if (a.paid && !a.refundedAt) {
      p.paidCents += priceBySession.get(a.groupSessionId) ?? 0;
    }
    peopleMap.set(key, p);
  }
  // Which attendees are ALREADY 1-on-1 clients — so the "warm" tag below only
  // marks people who keep coming back but haven't crossed over yet. Those are
  // the highest-value personal-note candidates in the whole funnel.
  const clientEmailRows =
    peopleMap.size > 0
      ? await db
          .selectDistinct({ email: clients.email })
          .from(clients)
          .innerJoin(sessions, eq(sessions.clientId, clients.id))
          .where(
            and(
              eq(clients.accountId, accountId),
              sql`${sessions.status} <> 'cancelled'`,
              sql`${clients.email} IS NOT NULL`
            )
          )
      : [];
  const oneOnOneEmails = new Set(
    clientEmailRows
      .map((r) => (r.email ?? "").trim().toLowerCase())
      .filter(Boolean)
  );

  // Most-frequent first — the regulars rise to the top.
  const people = [...peopleMap.values()].sort(
    (a, b) => b.attended - a.attended || (b.lastAt ?? 0) - (a.lastAt ?? 0)
  );

  return (
    <AppShell
      breadcrumb={[
        { label: "Circles", href: "/groups" },
        { label: group.name },
      ]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={email}
      locale={locale}
      timeZone={settings.timezone}
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
          {/* Anyone waiting on her, across every upcoming session — visible
              before she scrolls. Loose Ends is the queue where they're cleared
              in one pass; this is the pointer to it. */}
          {pendingTotal > 0 && (
            <Link
              href="/loose-ends"
              className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-md no-underline hover:brightness-[0.98] transition"
              style={{
                background: "var(--color-honey-50, #fbf3e4)",
                border: "1px solid var(--color-honey-100, #f0dfc4)",
              }}
            >
              <span className="text-sm text-ink-900" style={{ fontWeight: 600 }}>
                {pendingTotal === 1
                  ? "1 person is waiting to be approved"
                  : `${pendingTotal} people are waiting to be approved`}
              </span>
              <span className="text-xs text-honey-700 whitespace-nowrap">
                Review →
              </span>
            </Link>
          )}
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
        {upcomingSorted.length === 0 ? (
          <p className="text-sm text-ink-500 italic">
            None scheduled. Click <strong>Schedule session</strong> above to
            add one.
          </p>
        ) : (
          <div className="space-y-3">
            {[...(nextUp ? [nextUp] : []), ...laterUp].map((s, idx) => {
              // Only the NEXT circle is expanded — it's the one she actually
              // runs. Everything after it is a compact row that opens on click,
              // so a 12-week recurrence doesn't stack 12 rosters on one page.
              const isNext = idx === 0;
              const attendees = attendeesBySession.get(s.id) ?? [];
              const pending = attendees.filter(
                (a) => a.status === "pending"
              );
              const confirmed = attendees.filter(
                (a) => a.status === "confirmed"
              );
              const block = (
                <article key={s.id} className="paper-card p-5">
                  <header className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                    <div>
                      <h3
                        className="serif text-lg text-ink-900"
                        style={{ fontWeight: 500 }}
                      >
                        {formatWhen(new Date(s.scheduledAt), locale, practiceTz)}
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
                      {/* Resolve through the standing circle room, like the
                          Today card and both emails do. Reading s.meetUrl raw
                          meant the page where she SCHEDULED the Circle was the
                          one place showing no way in. */}
                      {(() => {
                        const roomUrl = resolveCircleMeetingUrl(
                          s.meetUrl,
                          settings.circleRoomUrl ?? null
                        );
                        if (!roomUrl) return null;
                        return (
                          <a
                            href={roomUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-md bg-plum-700 hover:bg-plum-600 text-white text-[13px] font-medium no-underline"
                          >
                            Walk into the Circle →
                          </a>
                        );
                      })()}
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
                          locale,
                          practiceTz
                        )}
                      />
                    </div>
                  </header>

                  {attendees.length === 0 ? (
                    <>
                      <p className="text-xs text-ink-500 italic mt-3">
                        No sign-ups yet. Share the public link to start.
                      </p>
                      <AddCircleAttendeeInline groupSessionId={s.id} />
                    </>
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
                      <AddCircleAttendeeInline groupSessionId={s.id} />
                    </div>
                  )}
                </article>
              );

              if (isNext) return <div key={s.id}>{block}</div>;

              return (
                <details
                  key={s.id}
                  className="border border-ink-100 rounded-md bg-white px-4 py-3"
                >
                  <summary className="flex items-baseline gap-3 cursor-pointer list-none select-none flex-wrap">
                    <span className="font-mono text-xs text-ink-600">
                      {formatWhen(new Date(s.scheduledAt), locale, practiceTz)}
                    </span>
                    <span className="text-xs text-ink-500">
                      {s.attendeeCount}/{s.capacity} spots
                    </span>
                    {pending.length > 0 && (
                      <span
                        className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded"
                        style={{
                          background: "var(--color-honey-50, #fbf3e4)",
                          color: "var(--color-honey-700, #b05c36)",
                        }}
                      >
                        {pending.length} waiting
                      </span>
                    )}
                    {s.topic && (
                      <span className="text-xs text-plum-700 truncate">
                        {s.topic}
                      </span>
                    )}
                    <span className="flex-1" />
                    <span className="text-xs text-plum-700">Open</span>
                  </summary>
                  <div className="mt-3">{block}</div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {people.length > 0 && (
        <section className="mb-10">
          {/* Attendance is stored per session, so "who keeps coming back?" was
              unanswerable without reading every session. Folded together here:
              one row per person across the whole Circle, regulars first. */}
          <details className="paper-card px-4 py-3 group">
            <summary className="flex items-baseline gap-2 cursor-pointer list-none select-none">
              <span
                className="serif text-xl text-ink-900"
                style={{ fontWeight: 500 }}
              >
                People
              </span>
              <span className="font-mono text-xs text-ink-400">
                · {people.length} {people.length === 1 ? "person" : "people"}
              </span>
              <span className="flex-1" />
              <span className="text-xs text-plum-700 group-open:hidden">
                Show
              </span>
              <span className="text-xs text-plum-700 hidden group-open:inline">
                Hide
              </span>
            </summary>
            <ol className="mt-3 border-t border-ink-100 divide-y divide-ink-100">
              {people.map((p) => (
                <li
                  key={p.email || p.name}
                  className="flex items-baseline gap-3 py-2 text-sm flex-wrap"
                >
                  <span className="text-ink-900" style={{ fontWeight: 500 }}>
                    {p.name || "(no name)"}
                  </span>
                  {p.email && (
                    <span className="text-[11px] text-ink-500 break-all">
                      {p.email}
                    </span>
                  )}
                  <span className="flex-1" />
                  {/* Warm = keeps coming back, hasn't gone 1-on-1. The single
                      best personal-note candidate — an automated email is the
                      floor, her own two lines are the ceiling. */}
                  {p.attended >= 2 &&
                    !oneOnOneEmails.has(p.email.trim().toLowerCase()) && (
                      <span
                        className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded"
                        style={{
                          background: "var(--color-honey-50, #fbf3e4)",
                          color: "var(--color-honey-700, #b05c36)",
                        }}
                        title="Has come more than once and hasn't tried a one-to-one yet — a short personal note from you converts better than any automated email."
                      >
                        warm
                      </span>
                    )}
                  {p.coming && (
                    <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-plum-50 text-plum-700">
                      coming
                    </span>
                  )}
                  <span className="font-mono text-xs text-ink-600">
                    {p.attended === 0
                      ? "—"
                      : `${p.attended}×`}
                  </span>
                  <span className="font-mono text-xs text-ink-500 w-16 text-right">
                    {p.paidCents > 0
                      ? formatMoney(p.paidCents, group.defaultCurrency)
                      : "—"}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-ink-400 mt-2">
              Times attended · total paid. Someone who has only booked an
              upcoming Circle shows “—” until it happens.
            </p>
          </details>
        </section>
      )}

      {past.length > 0 && (
        <section>
          {/* Past sessions are history, not working surface — a weekly circle
              adds one every week, so a flat list of full-width cards buries the
              page within a couple of months. Collapsed by default, compact rows
              inside, newest first, and the ones that actually gathered people
              read louder than the cancelled/empty ones. */}
          <details className="paper-card px-4 py-3 group">
            <summary className="flex items-baseline gap-2 cursor-pointer list-none select-none">
              <span
                className="serif text-xl text-ink-900"
                style={{ fontWeight: 500 }}
              >
                Past sessions
              </span>
              <span className="font-mono text-xs text-ink-400">
                · {pastHeld.length} held
                {pastQuiet.length > 0 && ` · ${pastQuiet.length} cancelled/empty`}
              </span>
              <span className="flex-1" />
              <span className="text-xs text-plum-700 group-open:hidden">
                Show
              </span>
              <span className="text-xs text-plum-700 hidden group-open:inline">
                Hide
              </span>
            </summary>

            <ol className="mt-3 border-t border-ink-100 divide-y divide-ink-100">
              {pastSorted.map((s) => {
                const quiet =
                  s.status === "cancelled" || s.attendeeCount === 0;
                return (
                  <li
                    key={s.id}
                    className="flex items-baseline gap-3 py-2 text-sm flex-wrap"
                  >
                    <span
                      className={`font-mono text-xs w-44 shrink-0 ${
                        quiet ? "text-ink-400" : "text-ink-700"
                      }`}
                    >
                      {formatWhen(new Date(s.scheduledAt), locale, practiceTz)}
                    </span>
                    {s.status === "cancelled" ? (
                      <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">
                        cancelled
                      </span>
                    ) : s.attendeeCount === 0 ? (
                      <span className="text-xs text-ink-400 italic">
                        no one signed up
                      </span>
                    ) : (
                      <span className="text-xs text-ink-700">
                        <strong style={{ fontWeight: 600 }}>
                          {s.attendeeCount}
                        </strong>{" "}
                        came · {s.paidCount} paid
                      </span>
                    )}
                    {s.topic && (
                      <span className="text-xs text-ink-500 italic truncate">
                        {s.topic}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>
        </section>
      )}
    </AppShell>
  );
}
