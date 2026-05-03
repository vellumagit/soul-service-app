// A quiet awareness strip on Today. Surfaces the practitioner's load so she
// knows when not to take a new client. Designed to be glanceable, not alarming.
import Link from "next/link";

type Capacity = {
  activeClients: number;
  sessionsThisWeek: number;
  openTasks: number;
  overdueTasks: number;
  heavyClients: number;
};

export function CapacityStrip({ capacity }: { capacity: Capacity }) {
  return (
    <div className="border border-ink-200 rounded-md bg-white grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 divide-x divide-ink-100 overflow-hidden">
      <Cell
        label="Active clients"
        value={capacity.activeClients.toString()}
        href="/clients?filter=active"
      />
      <Cell
        label="This week"
        value={`${capacity.sessionsThisWeek} sessions`}
        href="/calendar"
      />
      <Cell
        label="Open tasks"
        value={capacity.openTasks.toString()}
        accent={capacity.overdueTasks > 0 ? "amber" : "default"}
        sublabel={
          capacity.overdueTasks > 0
            ? `${capacity.overdueTasks} overdue`
            : undefined
        }
      />
      <Cell
        label="Handle with care"
        value={capacity.heavyClients.toString()}
        sublabel="with sensitivities flagged"
        href="/clients"
      />
      <Cell
        label="Capacity"
        value={loadLabel(capacity.activeClients)}
        sublabel={loadHint(capacity.activeClients)}
        accent={capacity.activeClients > 25 ? "amber" : "default"}
        className="hidden lg:flex"
      />
    </div>
  );
}

function loadLabel(active: number): string {
  if (active === 0) return "—";
  if (active <= 8) return "light";
  if (active <= 18) return "steady";
  if (active <= 25) return "full";
  return "heavy";
}

function loadHint(active: number): string {
  if (active === 0) return "no active clients";
  if (active <= 8) return "room to take more";
  if (active <= 18) return "comfortable rhythm";
  if (active <= 25) return "near capacity";
  return "consider closing intake";
}

function Cell({
  label,
  value,
  sublabel,
  accent = "default",
  href,
  className = "",
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: "default" | "amber" | "red";
  href?: string;
  className?: string;
}) {
  const valueCls = {
    default: "text-ink-900",
    amber: "text-amber-700",
    red: "text-red-700",
  }[accent];

  const inner = (
    <div
      className={`px-4 py-3 flex flex-col justify-center ${
        href ? "hover:bg-ink-50 transition" : ""
      } ${className}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-semibold ${valueCls}`}>
        {value}
      </div>
      {sublabel && (
        <div className="text-[10px] text-ink-400 mt-0.5">{sublabel}</div>
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
