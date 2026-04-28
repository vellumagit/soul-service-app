import { AppShell } from "@/components/AppShell";
import { listReadingsInRange } from "@/db/queries";
import { WeekCalendar } from "@/components/WeekCalendar";

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
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // back to Sunday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const readings = await listReadingsInRange(weekStart, weekEnd);

  return (
    <AppShell
      breadcrumb={[
        { label: "Readings calendar", href: "/calendar" },
        { label: "This week" },
      ]}
    >
      <WeekCalendar
        weekStart={weekStart.toISOString()}
        readings={readings.map((r) => ({
          id: r.id,
          soulCode: r.soulCode,
          soulName: r.soulName,
          type: r.type,
          status: r.status,
          scheduledAt: r.scheduledAt.toISOString(),
          durationMinutes: r.durationMinutes,
        }))}
      />
    </AppShell>
  );
}
