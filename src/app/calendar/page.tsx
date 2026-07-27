import Link from "next/link";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { groupSessions, groups } from "@/db/schema";
import { AppShell } from "@/components/AppShell";
import {
  listSessionsInRange,
  listClientsForPicker,
  getSettings,
} from "@/db/queries";
import { WeekCalendar } from "@/components/WeekCalendar";
import { MonthCalendar } from "@/components/MonthCalendar";
import { QuickActions } from "@/components/QuickActions";
import { ScheduleSessionDialog } from "@/components/ScheduleSessionDialog";
import { ScheduleSeriesDialog } from "@/components/ScheduleSeriesDialog";
import { CalendarJumpToDate } from "@/components/CalendarJumpToDate";
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";
import {
  resolveTimeZone,
  zonedAddDays,
  zonedDateKey,
  zonedWallTimeToUtc,
  zonedWeekRange,
  zonedWeekday,
  zonedYearMonthDay,
} from "@/lib/timezone";

export const dynamic = "force-dynamic";

type CalendarView = "week" | "month";

// The `start` param arrives either as a bare YYYY-MM-DD (nav links) or a full
// ISO instant (jump-to-date's noon-UTC). A bare date means a PRACTICE-TZ
// calendar day — resolve it to that day's noon instant so the range math
// below can't slip a day at the zone boundary.
function parseAnchor(raw: string | undefined, tz: string): Date {
  if (raw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (m) {
      return zonedWallTimeToUtc(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        12,
        0,
        tz
      );
    }
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; view?: string }>;
}) {
  const { email, accountId } = await requireSession();
  const { start: startParam, view: viewParam } = await searchParams;
  // Settings first: the fetch RANGE itself depends on the practice timezone.
  // The server runs UTC — anchoring weeks/days with setHours(0,0,0,0) put
  // every boundary 6-7h early, which made Saturday-evening sessions fall
  // outside BOTH adjacent weeks' fetches (invisible in either view).
  const settings = await getSettings(accountId);
  const tz = resolveTimeZone(settings.timezone);

  const view: CalendarView = viewParam === "month" ? "month" : "week";
  const anchor = parseAnchor(startParam, tz);

  // Fetch range (true instants) + display anchors (practice-tz date keys).
  let rangeStart: Date;
  let rangeEnd: Date;
  let weekStartInstant: Date;
  let monthStartInstant: Date;

  if (view === "month") {
    const ymd = zonedYearMonthDay(anchor, tz);
    monthStartInstant = zonedWallTimeToUtc(ymd.year, ymd.month0, 1, 0, 0, tz);
    // Grid extends ~6 weeks: from the Sunday before the 1st through 42 days.
    rangeStart = zonedAddDays(
      monthStartInstant,
      -zonedWeekday(monthStartInstant, tz),
      tz
    );
    rangeEnd = zonedAddDays(rangeStart, 42, tz);
    weekStartInstant = rangeStart;
  } else {
    const wr = zonedWeekRange(anchor, tz);
    rangeStart = wr.start;
    rangeEnd = wr.end;
    weekStartInstant = wr.start;
    const wymd = zonedYearMonthDay(wr.start, tz);
    monthStartInstant = zonedWallTimeToUtc(wymd.year, wymd.month0, 1, 0, 0, tz);
  }

  const weekStartKey = zonedDateKey(weekStartInstant, tz);
  const monthStartKey = zonedDateKey(monthStartInstant, tz);

  const [sessions, clients, circleRows] = await Promise.all([
    listSessionsInRange(accountId, rangeStart, rangeEnd),
    listClientsForPicker(accountId),
    // Circles were invisible on her own calendar — she could double-book
    // herself against one and nothing would flag it.
    db
      .select({
        id: groupSessions.id,
        groupId: groupSessions.groupId,
        groupName: groups.name,
        scheduledAt: groupSessions.scheduledAt,
        durationMinutes: groupSessions.durationMinutes,
        status: groupSessions.status,
      })
      .from(groupSessions)
      .innerJoin(groups, eq(groups.id, groupSessions.groupId))
      .where(
        and(
          eq(groupSessions.accountId, accountId),
          gte(groupSessions.scheduledAt, rangeStart),
          lt(groupSessions.scheduledAt, rangeEnd)
        )
      ),
  ]);
  const locale = asLocale(settings.uiLanguage);

  const sessionData = [
    ...sessions.map((s) => ({
      id: s.id,
      clientId: s.clientId,
      clientName: s.clientName,
      type: s.type,
      status: s.status,
      scheduledAt: s.scheduledAt.toISOString(),
      durationMinutes: s.durationMinutes,
      paid: s.paid,
    })),
    ...circleRows.map((c) => ({
      id: c.id,
      // No client — a Circle belongs to a group. `href` sends the click to the
      // Circle instead of a client profile.
      clientId: c.groupId,
      href: `/groups/${c.groupId}`,
      clientName: c.groupName,
      type: "Circle",
      status: c.status,
      scheduledAt: c.scheduledAt.toISOString(),
      durationMinutes: c.durationMinutes,
      paid: true,
    })),
  ];

  // Navigation helpers — every href carries a practice-tz date key.
  const prevHref =
    view === "month"
      ? `/calendar?view=month&start=${shiftMonthKey(monthStartKey, -1)}`
      : `/calendar?view=week&start=${zonedDateKey(zonedAddDays(weekStartInstant, -7, tz), tz)}`;
  const nextHref =
    view === "month"
      ? `/calendar?view=month&start=${shiftMonthKey(monthStartKey, 1)}`
      : `/calendar?view=week&start=${zonedDateKey(zonedAddDays(weekStartInstant, 7, tz), tz)}`;
  const todayHref = `/calendar?view=${view}`;

  const rangeLabel =
    view === "month" ? monthLabel(monthStartKey) : formatWeekRange(weekStartKey);

  return (
    <AppShell
      breadcrumb={[
        { label: t(locale, "nav.calendar"), href: "/calendar" },
        {
          label:
            view === "month"
              ? monthLabel(monthStartKey)
              : t(locale, "calendar.thisWeek"),
        },
      ]}
      rightAction={<QuickActions clients={clients} />}
      userEmail={email}
      locale={locale}
      timeZone={settings.timezone}
    >
      {/* Toolbar: nav + range label + view switcher + create actions */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight mr-3">
          {t(locale, "calendar.title")}
        </h1>

        {/* Date navigation */}
        <div className="flex items-center border border-ink-200 rounded-md overflow-hidden">
          <Link
            href={prevHref}
            className="px-2 py-1 text-ink-500 hover:bg-ink-50"
            aria-label="Previous"
          >
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <Link
            href={todayHref}
            className="px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50 border-l border-r border-ink-200"
          >
            Today
          </Link>
          <Link
            href={nextHref}
            className="px-2 py-1 text-ink-500 hover:bg-ink-50"
            aria-label="Next"
          >
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        </div>

        <div className="text-sm font-medium text-ink-700">{rangeLabel}</div>

        {/* Jump-to-date picker — primary way to navigate to a specific past
            (or future) date without clicking Prev/Next over and over. */}
        <CalendarJumpToDate
          view={view}
          currentStart={view === "month" ? monthStartKey : weekStartKey}
        />

        <div className="flex-1" />

        {/* View switcher */}
        <div className="flex items-center border border-ink-200 rounded-md overflow-hidden text-xs">
          <Link
            href={`/calendar?view=week&start=${weekStartKey}`}
            data-active={view === "week"}
            className="px-3 py-1.5 font-medium text-ink-500 data-[active=true]:bg-ink-900 data-[active=true]:text-white hover:bg-ink-50 data-[active=true]:hover:bg-ink-800"
          >
            Week
          </Link>
          <Link
            href={`/calendar?view=month&start=${monthStartKey}`}
            data-active={view === "month"}
            className="px-3 py-1.5 font-medium text-ink-500 data-[active=true]:bg-ink-900 data-[active=true]:text-white hover:bg-ink-50 data-[active=true]:hover:bg-ink-800 border-l border-ink-200"
          >
            Month
          </Link>
        </div>

        {/* Action buttons */}
        <ScheduleSeriesDialog clients={clients} />
        <ScheduleSessionDialog
          clients={clients}
          sabbathDays={(settings.sabbathDays ?? []) as string[]}
        />
      </div>

      {/* The calendar itself. Sabbath days come straight from settings —
          both views render them with a soft shaded background. */}
      {view === "month" ? (
        <MonthCalendar
          monthStart={monthStartKey}
          sessions={sessionData}
          sabbathDays={(settings.sabbathDays ?? []) as string[]}
        />
      ) : (
        <WeekCalendar
          weekStart={weekStartKey}
          sessions={sessionData}
          sabbathDays={(settings.sabbathDays ?? []) as string[]}
        />
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// All helpers below work on practice-tz date KEYS ("YYYY-MM-DD") and format
// via noon-UTC anchors with an explicit UTC timeZone — the server's own zone
// can never shift a label or a link by a day.

function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatWeekRange(weekStartKey: string): string {
  const start = new Date(`${weekStartKey}T12:00:00Z`);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${f(start)} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  return `${f(start)} – ${f(end)}, ${end.getUTCFullYear()}`;
}
