import type { TimelineEvent } from "@/db/schema";
import { relativeTime } from "@/lib/format";

const KIND_META: Record<
  string,
  { cls: string; d: string }
> = {
  session_upcoming: {
    cls: "bg-flame-100 text-flame-700",
    d: "M12 4v16m8-8H4",
  },
  session: {
    cls: "bg-ink-100 text-ink-700",
    d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  note: {
    cls: "bg-ink-100 text-ink-700",
    d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586L19 9v10a2 2 0 01-2 2z",
  },
  upload: {
    cls: "bg-green-50 text-green-700",
    d: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  },
  invoice_paid: {
    cls: "bg-green-50 text-green-700",
    d: "M5 13l4 4L19 7",
  },
  invoice_overdue: {
    cls: "bg-red-50 text-red-700",
    d: "M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  intake_pending: {
    cls: "bg-amber-50 text-amber-700",
    d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  file_open: {
    cls: "bg-ink-100 text-ink-500",
    d: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  },
  voice_memo: {
    cls: "bg-rose-50 text-rose-600",
    d: "M19 11a7 7 0 01-14 0M12 18v3m0 0H9m3 0h3m-3-7a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z",
  },
  manual: {
    cls: "bg-ink-100 text-ink-700",
    d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586L19 9v10a2 2 0 01-2 2z",
  },
};

export function TimelineFeed({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-sm text-ink-400 italic">
        [No activity yet — schedule a first reading or write a note to start the
        timeline]
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((e) => {
        const meta = KIND_META[e.kind] ?? KIND_META.manual;
        return (
          <div key={e.id} className="timeline-item flex gap-3">
            <div
              className={`w-6 h-6 rounded-full ${meta.cls} flex items-center justify-center shrink-0 z-10 relative`}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={meta.d}
                />
              </svg>
            </div>
            <div className="flex-1 border border-ink-200 rounded-md p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-ink-900 text-sm">
                  {e.title}
                </div>
                <div className="font-mono text-[11px] text-ink-400">
                  {relativeTime(e.occurredAt)}
                </div>
              </div>
              {e.body && (
                <div className="text-xs text-ink-600 mt-1 leading-relaxed">
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
