import Link from "next/link";
import type { ActivityEvent } from "@/db/queries";
import { relativeTime } from "@/lib/format";

const KIND_META: Record<
  ActivityEvent["kind"],
  { color: string; icon: string }
> = {
  client_created: { color: "bg-ink-100 text-ink-600", icon: "✨" },
  session_scheduled: { color: "bg-flame-100 text-flame-700", icon: "📅" },
  session_completed: { color: "bg-green-50 text-green-700", icon: "✓" },
  session_cancelled: { color: "bg-ink-100 text-ink-500", icon: "×" },
  session_paid: { color: "bg-green-50 text-green-700", icon: "$" },
  file_uploaded: { color: "bg-blue-50 text-blue-700", icon: "📎" },
  task_created: { color: "bg-amber-50 text-amber-700", icon: "•" },
  task_completed: { color: "bg-green-50 text-green-700", icon: "✓" },
  communication: { color: "bg-purple-50 text-purple-700", icon: "✉" },
  invoice_generated: { color: "bg-flame-100 text-flame-700", icon: "📄" },
};

export function RecentActivityMini({
  events,
  clientId,
  limit = 6,
}: {
  events: ActivityEvent[];
  clientId: string;
  limit?: number;
}) {
  const recent = events.slice(0, limit);

  if (recent.length === 0) {
    return (
      <div className="text-xs text-ink-400 italic">
        Nothing yet. Activity shows here as you work with them.
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2.5">
        {recent.map((e) => {
          const meta = KIND_META[e.kind];
          return (
            <li key={e.id} className="flex items-start gap-2.5 text-sm">
              <div
                className={`w-5 h-5 rounded-full ${meta.color} flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5`}
              >
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-ink-800 truncate">{e.title}</span>
                  <span className="font-mono text-[10px] text-ink-400 shrink-0">
                    {relativeTime(e.occurredAt)}
                  </span>
                </div>
                {e.body && (
                  <div className="text-[11px] text-ink-500 leading-relaxed line-clamp-2">
                    {e.body}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {events.length > limit && (
        <div className="mt-3 text-right">
          <Link
            href={`/clients/${clientId}?tab=activity`}
            className="text-xs text-flame-700 hover:underline"
          >
            All activity ({events.length}) →
          </Link>
        </div>
      )}
    </>
  );
}
