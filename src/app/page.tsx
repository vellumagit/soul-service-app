import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { listReadingsInRange, listSouls } from "@/db/queries";
import { readingTypeLabel } from "@/lib/format";
import { NewSoulDialog } from "@/components/NewSoulDialog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Today's readings — pull from calendar
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const [todayReadings, souls] = await Promise.all([
    listReadingsInRange(startOfToday, endOfToday),
    listSouls(),
  ]);

  const next = todayReadings.find((r) => r.status === "scheduled");
  const isFirstRun = souls.length === 0;

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
        {isFirstRun
          ? "Welcome. Open the first soul's file to get started."
          : "Today's scheduled readings + items needing your attention before the next one."}
      </p>

      {isFirstRun ? (
        <div className="border border-dashed border-ink-300 rounded-md p-12 text-center">
          <div className="text-sm text-ink-700 font-medium mb-1">
            This is your space.
          </div>
          <div className="text-xs text-ink-500 mb-5 max-w-md mx-auto">
            Souls you&apos;re reading for live in their own files. Readings,
            intentions, what you&apos;re holding for them — all in one place.
            Open the first one to begin.
          </div>
          <NewSoulDialog />
        </div>
      ) : next ? (
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
          Nothing scheduled today.{" "}
          <Link
            href="/calendar"
            className="text-flame-700 hover:underline"
          >
            See the week
          </Link>
          .
        </div>
      )}

      {!isFirstRun && (
        <>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-400">
            Quick links
          </div>
          <div className="border border-ink-200 rounded-md divide-y divide-ink-100 overflow-hidden">
            <Link
              href="/souls"
              className="block px-4 py-2.5 text-sm hover:bg-ink-50"
            >
              <span className="text-ink-900 font-medium">All souls</span>
              <span className="text-ink-500 ml-2">
                · {souls.length} files in your care
              </span>
            </Link>
            <Link
              href="/calendar"
              className="block px-4 py-2.5 text-sm hover:bg-ink-50"
            >
              <span className="text-ink-900 font-medium">Calendar</span>
              <span className="text-ink-500 ml-2">
                · this week&apos;s readings
              </span>
            </Link>
          </div>
        </>
      )}
    </AppShell>
  );
}
