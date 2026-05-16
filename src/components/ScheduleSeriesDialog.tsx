"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { scheduleSessionSeries } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";

type ClientOption = { id: string; fullName: string };

type Frequency = "weekly" | "biweekly" | "monthly";

const MAX_OCCURRENCES = 52;

// datetime-local string, defaulted to "tomorrow at 10am"
function defaultFirstAt() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatPreview(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function computeDates(
  firstAt: Date,
  frequency: Frequency,
  count: number
): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(firstAt);
    if (frequency === "weekly") d.setDate(firstAt.getDate() + i * 7);
    else if (frequency === "biweekly") d.setDate(firstAt.getDate() + i * 14);
    else d.setMonth(firstAt.getMonth() + i);
    dates.push(d);
  }
  return dates;
}

export function ScheduleSeriesDialog({
  clients,
  defaultClientId,
  defaultType,
  trigger,
}: {
  clients: ClientOption[];
  defaultClientId?: string;
  defaultType?: string | null;
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyboard shortcut `r` opens this dialog from anywhere.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("shortcuts:new-series", handler);
    return () => window.removeEventListener("shortcuts:new-series", handler);
  }, []);

  // Controlled bits we need for the live preview
  const [firstAt, setFirstAt] = useState<string>(defaultFirstAt());
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [occurrenceCount, setOccurrenceCount] = useState<number>(8);

  const noClients = clients.length === 0;

  const previewDates = useMemo(() => {
    const d = new Date(firstAt);
    if (Number.isNaN(d.getTime())) return [];
    const safeCount = Math.min(Math.max(1, occurrenceCount), MAX_OCCURRENCES);
    return computeDates(d, frequency, safeCount);
  }, [firstAt, frequency, occurrenceCount]);

  const lastDate = previewDates[previewDates.length - 1];

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="border border-ink-200 hover:bg-ink-50 text-ink-700 text-sm font-medium px-3 py-2 rounded-md inline-flex items-center gap-1.5"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm5-7a1 1 0 100-2 1 1 0 000 2zm4 0a1 1 0 100-2 1 1 0 000 2zm-8 4a1 1 0 100-2 1 1 0 000 2zm4 0a1 1 0 100-2 1 1 0 000 2zm4 0a1 1 0 100-2 1 1 0 000 2z"
            />
          </svg>
          New series
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a recurring series"
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="schedule-series-form"
              disabled={submitting || noClients || previewDates.length === 0}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting
                ? "Creating…"
                : `Create ${previewDates.length} sessions`}
            </button>
          </>
        }
      >
        {noClients ? (
          <div className="text-sm text-ink-600">
            Add a client first — then come back here to set up their series.
          </div>
        ) : (
          <form
            id="schedule-series-form"
            action={async (fd) => {
              setSubmitting(true);
              setError(null);
              try {
                const result = await scheduleSessionSeries(fd);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
              } catch (err) {
                rethrowIfRedirect(err);
                setError(
                  err instanceof Error ? err.message : "Couldn't create the series."
                );
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
                {error}
              </div>
            )}

            <Field label="Client" required>
              <select
                name="clientId"
                required
                defaultValue={defaultClientId ?? ""}
                className={inputCls}
              >
                {!defaultClientId && <option value="">— choose —</option>}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Session type">
                <input
                  name="type"
                  defaultValue={defaultType ?? "Session"}
                  className={inputCls}
                  placeholder="Whatever you call this kind of session"
                />
              </Field>
              <Field label="Duration (min)">
                <input
                  name="durationMinutes"
                  type="number"
                  defaultValue={60}
                  min={15}
                  max={180}
                  step={15}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="First session" required>
              <input
                name="firstAt"
                type="datetime-local"
                required
                value={firstAt}
                onChange={(e) => setFirstAt(e.target.value)}
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Repeat" required>
                <select
                  name="frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as Frequency)}
                  className={inputCls}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              <Field
                label="How many sessions"
                required
                hint={`Max ${MAX_OCCURRENCES}`}
              >
                <input
                  name="occurrenceCount"
                  type="number"
                  required
                  value={occurrenceCount}
                  onChange={(e) =>
                    setOccurrenceCount(Number(e.target.value) || 0)
                  }
                  min={1}
                  max={MAX_OCCURRENCES}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Intention (optional)" hint="Applies to every session in the series. You can still edit each one individually after.">
              <input
                name="intention"
                className={inputCls}
                placeholder="What this series is about, in their words if you have them"
              />
            </Field>

            {/* Live preview */}
            <div className="border-t border-ink-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-ink-700">
                  Preview ({previewDates.length}{" "}
                  {previewDates.length === 1 ? "session" : "sessions"})
                </div>
                {lastDate && (
                  <div className="text-[11px] text-ink-500">
                    Last:{" "}
                    <span className="text-ink-700 font-medium">
                      {formatPreview(lastDate)}
                    </span>
                  </div>
                )}
              </div>
              {previewDates.length > 0 ? (
                <ul className="max-h-40 overflow-auto border border-ink-100 rounded bg-ink-50/40 divide-y divide-ink-100">
                  {previewDates.map((d, i) => (
                    <li
                      key={i}
                      className="px-3 py-1.5 text-xs flex items-center gap-3"
                    >
                      <span className="font-mono text-ink-400 w-6 shrink-0">
                        {i + 1}.
                      </span>
                      <span
                        className={
                          d < new Date()
                            ? "text-ink-400 italic"
                            : "text-ink-700"
                        }
                      >
                        {formatPreview(d)}
                      </span>
                      {d < new Date() && (
                        <span className="chip bg-ink-100 text-ink-500 shrink-0">
                          PAST · will be marked completed
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-ink-400 italic">
                  Set a first session date to see the preview.
                </div>
              )}
              <p className="text-[11px] text-ink-400 mt-2">
                Past-dated sessions in the series are saved as{" "}
                <strong>completed</strong> (useful for backfilling clients
                you&apos;ve been seeing on a regular cadence). Future ones are
                scheduled.
              </p>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
