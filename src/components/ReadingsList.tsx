import type { Reading } from "@/db/schema";
import { readingTypeLabel, shortDate } from "@/lib/format";

const STATUS_CHIP: Record<string, string> = {
  scheduled: "bg-ink-100 text-ink-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-ink-100 text-ink-500",
  no_show: "bg-amber-50 text-amber-700",
};

export function ReadingsList({ readings }: { readings: Reading[] }) {
  if (readings.length === 0) {
    return (
      <div className="text-sm text-ink-400 italic">
        [No readings yet — schedule the first one]
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {readings.map((r) => {
        const isCompleted = r.status === "completed";
        return (
          <details
            key={r.id}
            className="border border-ink-200 rounded-md overflow-hidden"
            open={r.status === "scheduled"}
          >
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-ink-50 list-none">
              <span className="font-mono text-xs text-ink-700 w-20">
                {shortDate(r.scheduledAt)}
              </span>
              <span className="text-ink-600 text-sm flex-1">
                {readingTypeLabel(r.type)} · {r.durationMinutes}m
              </span>
              <span className="text-xs text-ink-500 italic truncate max-w-[40%]">
                {r.intention ?? ""}
              </span>
              <span
                className={`chip ${STATUS_CHIP[r.status] ?? "bg-ink-100 text-ink-500"}`}
              >
                {r.status.toUpperCase()}
              </span>
            </summary>
            <div className="border-t border-ink-100 px-4 py-4 bg-ink-50/40 text-sm space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-ink-200 bg-white rounded p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
                    Pre-reading
                  </div>
                  {!isCompleted ? (
                    <div className="text-xs text-ink-400">
                      Not recorded yet
                    </div>
                  ) : (
                    <div className="text-xs text-ink-700 space-y-0.5">
                      <div>
                        Heart open{" "}
                        <span className="font-mono">
                          {r.preHeartOpen ?? "—"}/10
                        </span>
                      </div>
                      <div>
                        Self-love{" "}
                        <span className="font-mono">
                          {r.preSelfLove ?? "—"}/10
                        </span>
                      </div>
                      <div>
                        Body{" "}
                        <span className="text-ink-600">
                          {r.preBody ?? "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="border border-ink-200 bg-white rounded p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
                    Post-reading
                  </div>
                  {!isCompleted ? (
                    <div className="text-xs text-ink-400">
                      Will be recorded after the reading
                    </div>
                  ) : (
                    <div className="text-xs text-ink-700 space-y-0.5">
                      <div>
                        Heart open{" "}
                        <span className="font-mono">
                          {r.postHeartOpen ?? "—"}/10
                        </span>
                      </div>
                      <div>
                        Self-love{" "}
                        <span className="font-mono">
                          {r.postSelfLove ?? "—"}/10
                        </span>
                      </div>
                      <div>
                        Body{" "}
                        <span className="text-ink-600">
                          {r.postBody ?? "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
                  Reading log
                </div>
                <div className="text-ink-700 leading-relaxed bg-white border border-ink-200 rounded p-3 whitespace-pre-wrap">
                  {r.log ?? "(will record after the reading)"}
                </div>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
