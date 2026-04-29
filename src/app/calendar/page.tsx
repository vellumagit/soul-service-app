import { AppShell } from "@/components/AppShell";
import { listSessionsInRange, listClientsForPicker } from "@/db/queries";
import { WeekCalendar } from "@/components/WeekCalendar";
import { QuickActions } from "@/components/QuickActions";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const { start: startParam } = await searchParams;

  // Anchor to the Sunday of the week we're viewing
  const anchor = startParam ? new Date(startParam) : new Date();
  const weekStart = new Date(anchor);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [sessions, clients] = await Promise.all([
    listSessionsInRange(weekStart, weekEnd),
    listClientsForPicker(),
  ]);

  return (
    <AppShell
      breadcrumb={[
        { label: "Calendar", href: "/calendar" },
        { label: "This week" },
      ]}
      rightAction={<QuickActions clients={clients} />}
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
