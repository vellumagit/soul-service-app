import Link from "next/link";
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
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type CalendarView = "week" | "month";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; view?: string }>;
}) {
  const { email } = await requireSession();
  const { start: startParam, view: viewParam } = await searchParams;

  const view: CalendarView = viewParam === "month" ? "month" : "week";
  const anchor = startParam ? new Date(startParam) : new Date();

  // Compute the date range to fetch based on view
  let rangeStart: Date;
  let rangeEnd: Date;
  let weekStart: Date;
  let monthStart: Date;

  if (view === "month") {
    monthStart = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      1,
      0,
      0,
      0,
      0
    );
    // Grid extends ~6 weeks: from the Sunday before the 1st through 42 days later.
    rangeStart = new Date(monthStart);
    rangeStart.setDate(monthStart.getDate() - monthStart.getDay());
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeStart.getDate() + 42);
    // Compute week anchor for switcher links (the Sunday of monthStart's week)
    weekStart = new Date(monthStart);
    weekStart.setDate(monthStart.getDate() - monthStart.getDay());
  } else {
    weekStart = new Date(anchor);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    rangeStart = weekStart;
    rangeEnd = new Date(weekStart);
    rangeEnd.setDate(rangeEnd.getDate() + 7);
    // For month-view link, jump to the 1st of the week's month
    monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  }

  const [sessions, clients, settings] = await Promise.all([
    listSessionsInRange(rangeStart, rangeEnd),
    listClientsForPicker(),
    getSettings(),
  ]);
  const locale = asLocale(settings.uiLanguage);

  const sessionData = sessions.map((s) => ({
    id: s.id,
    clientId: s.clientId,
    clientName: s.clientName,
    type: s.type,
    status: s.status,
    scheduledAt: s.scheduledAt.toISOString(),
    durationMinutes: s.durationMinutes,
    paid: s.paid,
  }));

  // Navigation helpers
  const prevHref =
    view === "month"
      ? `/calendar?view=month&start=${addMonths(monthStart, -1).toISOString()}`
      : `/calendar?view=week&start=${addDays(weekStart, -7).toISOString()}`;
  const nextHref =
    view === "month"
      ? `/calendar?view=month&start=${addMonths(monthStart, 1).toISOString()}`
      : `/calendar?view=week&start=${addDays(weekStart, 7).toISOString()}`;
  const todayHref = `/calendar?view=${view}`;

  const rangeLabel =
    view === "month"
      ? monthStart.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : formatWeekRange(weekStart);

  return (
    <AppShell
      breadcrumb={[
        { label: t(locale, "nav.calendar"), href: "/calendar" },
        {
          label:
            view === "month"
              ? monthStart.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })
              : t(locale, "calendar.thisWeek"),
        },
      ]}
      rightAction={<QuickActions clients={clients} />}
      userEmail={email}
      locale={locale}
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

        <div className="flex-1" />

        {/* View switcher */}
        <div className="flex items-center border border-ink-200 rounded-md overflow-hidden text-xs">
          <Link
            href={`/calendar?view=week&start=${weekStart.toISOString()}`}
            data-active={view === "week"}
            className="px-3 py-1.5 font-medium text-ink-500 data-[active=true]:bg-ink-900 data-[active=true]:text-white hover:bg-ink-50 data-[active=true]:hover:bg-ink-800"
          >
            Week
          </Link>
          <Link
            href={`/calendar?view=month&start=${monthStart.toISOString()}`}
            data-active={view === "month"}
            className="px-3 py-1.5 font-medium text-ink-500 data-[active=true]:bg-ink-900 data-[active=true]:text-white hover:bg-ink-50 data-[active=true]:hover:bg-ink-800 border-l border-ink-200"
          >
            Month
          </Link>
        </div>

        {/* Action buttons */}
        <ScheduleSeriesDialog clients={clients} />
        <ScheduleSessionDialog clients={clients} />
      </div>

      {/* The calendar itself */}
      {view === "month" ? (
        <MonthCalendar
          monthStart={monthStart.toISOString()}
          sessions={sessionData}
        />
      ) : (
        <WeekCalendar
          weekStart={weekStart.toISOString()}
          sessions={sessionData}
        />
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${weekStart.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${weekStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}, ${end.getFullYear()}`;
}
