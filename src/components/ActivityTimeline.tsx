import type { ActivityEvent } from "@/db/queries";
import { relativeTime, shortDateTime } from "@/lib/format";

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

export function ActivityTimeline({
  events,
}: {
  events: ActivityEvent[];
}) {
  if (events.length === 0) {
    return (
      <div className="text-sm text-ink-400 italic text-center py-8">
        Activity shows up here as you schedule sessions, take notes, mark
        payments, and upload files.
      </div>
    );
  }

  return (
    <div className="relative space-y-3">
      {events.map((e, i) => {
        const meta = KIND_META[e.kind];
        return (
          <div
            key={e.id}
            className="flex gap-3 relative"
          >
            {/* Connector line */}
            {i < events.length - 1 && (
              <div
                className="absolute left-3 top-7 bottom-0 w-px bg-ink-200"
                style={{ marginBottom: -12 }}
              />
            )}
            <div
              className={`w-6 h-6 rounded-full ${meta.color} flex items-center justify-center text-xs font-semibold shrink-0 z-10 relative`}
            >
              {meta.icon}
            </div>
            <div className="flex-1 min-w-0 pb-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <div className="text-sm font-medium text-ink-900">
                  {e.title}
                </div>
                <div
                  className="text-[11px] text-ink-400 font-mono"
                  title={shortDateTime(e.occurredAt)}
                >
                  {relativeTime(e.occurredAt)}
                </div>
              </div>
              {e.body && (
                <div className="text-xs text-ink-600 mt-0.5 leading-relaxed whitespace-pre-wrap">
                  {e.body}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
