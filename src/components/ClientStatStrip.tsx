import Link from "next/link";
import { fullDate, money, relativeTime } from "@/lib/format";

type Stats = {
  sessionsHeld: number;
  togetherSince: Date;
  nextSessionAt: Date | null;
  lifetimePaidCents: number;
  unpaidCents: number;
  unpaidCount: number;
};

// Wide stat strip across the top of the client overview. Each cell is
// scannable, big-number-led. Color varies by intent.
export function ClientStatStrip({
  stats,
  clientId,
}: {
  stats: Stats;
  clientId: string;
}) {
  const monthsSince = monthsBetween(stats.togetherSince, new Date());

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border border-ink-200 rounded-lg bg-white divide-x divide-ink-100 overflow-hidden mb-5">
      <Cell
        label="Sessions held"
        value={stats.sessionsHeld.toString()}
        sub={
          stats.sessionsHeld > 0
            ? `~ every ${avgIntervalLabel(stats.sessionsHeld, monthsSince)}`
            : "no sessions yet"
        }
      />
      <Cell
        label="Together since"
        value={shortMonth(stats.togetherSince)}
        sub={monthsSinceLabel(monthsSince)}
      />
      <Cell
        label="Next session"
        value={
          stats.nextSessionAt ? relativeTime(stats.nextSessionAt) : "—"
        }
        sub={
          stats.nextSessionAt ? fullDate(stats.nextSessionAt) : "nothing booked"
        }
        accent={stats.nextSessionAt ? "flame" : "muted"}
      />
      <Cell
        label="Exchanged"
        value={money(stats.lifetimePaidCents)}
        sub="lifetime received"
      />
      <Cell
        label="Open balance"
        value={money(stats.unpaidCents)}
        sub={
          stats.unpaidCount === 0
            ? "all paid"
            : `${stats.unpaidCount} unpaid session${
                stats.unpaidCount === 1 ? "" : "s"
              }`
        }
        accent={stats.unpaidCents > 0 ? "amber" : "muted"}
        href={
          stats.unpaidCents > 0
            ? `/clients/${clientId}?tab=sessions`
            : undefined
        }
        className="hidden lg:flex"
      />
    </div>
  );
}

function monthsBetween(start: Date, end: Date): number {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(months, 0);
}

function monthsSinceLabel(months: number): string {
  if (months === 0) return "this month";
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (remainder === 0) return years === 1 ? "1 year ago" : `${years} years ago`;
  return `${years}y ${remainder}mo ago`;
}

function avgIntervalLabel(sessions: number, months: number): string {
  if (sessions <= 1) return "—";
  const denom = Math.max(months, 1);
  const perMonth = sessions / denom;
  if (perMonth >= 4) return "weekly";
  if (perMonth >= 2) return "every 2 weeks";
  if (perMonth >= 1) return "monthly";
  if (perMonth >= 0.5) return "every ~2 months";
  return "every few months";
}

function shortMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function Cell({
  label,
  value,
  sub,
  accent = "default",
  href,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "flame" | "amber" | "muted";
  href?: string;
  className?: string;
}) {
  const valueCls = {
    default: "text-ink-900",
    flame: "text-flame-700",
    amber: "text-amber-700",
    muted: "text-ink-500",
  }[accent];

  const inner = (
    <div
      className={`px-4 py-3.5 flex flex-col justify-center ${
        href ? "hover:bg-ink-50 transition" : ""
      } ${className}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${valueCls}`}>{value}</div>
      {sub && (
        <div className="text-[11px] text-ink-400 mt-0.5 truncate">{sub}</div>
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
