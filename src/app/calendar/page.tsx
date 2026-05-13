import { AppShell } from "@/components/AppShell";
import {
  listSessionsInRange,
  listClientsForPicker,
  getSettings,
} from "@/db/queries";
import { WeekCalendar } from "@/components/WeekCalendar";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const { email } = await requireSession();
  const { start: startParam } = await searchParams;

  // Anchor to the Sunday of the week we're viewing
  const anchor = startParam ? new Date(startParam) : new Date();
  const weekStart = new Date(anchor);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [sessions, clients, settings] = await Promise.all([
    listSessionsInRange(weekStart, weekEnd),
    listClientsForPicker(),
    getSettings(),
  ]);
  const locale = asLocale(settings.uiLanguage);

  return (
    <AppShell
      breadcrumb={[
        { label: t(locale, "nav.calendar"), href: "/calendar" },
        { label: t(locale, "calendar.thisWeek") },
      ]}
      rightAction={<QuickActions clients={clients} />}
      userEmail={email}
      locale={locale}
    >
      <WeekCalendar
        weekStart={weekStart.toISOString()}
        sessions={sessions.map((s) => ({
          id: s.id,
          clientId: s.clientId,
          clientName: s.clientName,
          type: s.type,
          status: s.status,
          scheduledAt: s.scheduledAt.toISOString(),
          durationMinutes: s.durationMinutes,
          paid: s.paid,
        }))}
      />
    </AppShell>
  );
}
