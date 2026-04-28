import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { listReadingsInRange } from "@/db/queries";
import { readingTypeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Today's readings — pull from calendar
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const todayReadings = await listReadingsInRange(startOfToday, endOfToday);
  const next = todayReadings.find((r) => r.status === "scheduled");

  return (
    <AppShell
      breadcrumb={[
        { label: "Today's thread" },
        { label: "What needs you now" },
      ]}
    >
      <h1 className="text-xl font-semibold text-ink-900 tracking-tight mb-1">
        Today&apos;s thread
      </h1>
      <p className="text-xs text-ink-500 mb-5">
        Surfaces today&apos;s scheduled readings + the system-detected items
        needing attention before the next one starts.
      </p>

      {next ? (
        <div className="border border-ink-200 rounded-md bg-ink-50/40 mb-5">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="chip bg-flame-100 text-flame-700">NEXT</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <Link
                  href={`/souls/${encodeURIComponent(next.soulCode)}`}
                  className="font-medium text-ink-900 hover:underline"
                >
                  {next.soulName}
                </Link>
                <span className="text-ink-400">·</span>
                <span className="text-ink-600">
                  {readingTypeLabel(next.type)} / {next.durationMinutes}m
                </span>
                <span className="text-ink-400">·</span>
                <span className="font-mono text-ink-600">
                  {next.scheduledAt.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="text-xs text-ink-500 mt-0.5">
                {`{Auto-summary: reading number for this soul · last-reading callback · prep cue from pinned note}`}
              </div>
            </div>
            {next.meetUrl && (
              <a
                href={next.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded inline-flex items-center gap-1.5"
              >
                Join
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="border border-ink-200 rounded-md p-6 text-center text-ink-500 text-sm mb-5">
          No more readings scheduled today.
        </div>
      )}

      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-400">
        What needs you
      </div>
      <div className="border border-ink-200 rounded-md divide-y divide-ink-100 overflow-hidden">
        <div className="px-4 py-2.5 text-sm text-ink-500 italic">
          [Action items will be surfaced here by the system: intake pending ·
          overdue exchange held with care · reading logs not yet written ·
          consents expiring · cadence drift]
        </div>
      </div>
    </AppShell>
  );
}
