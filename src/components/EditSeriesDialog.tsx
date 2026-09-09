"use client";

// Edit a recurring series "this and following". Opens from any upcoming
// occurrence's card, loads the series rule, and lets her change the next
// session's day/time (which re-anchors the whole rhythm), the cadence, length,
// title, intention, total count, and online/in person — applied from the next
// occurrence onward. Past sessions and individually moved/cancelled ones are
// never touched (the server enforces that; this copy just says so).

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import {
  editSessionSeries,
  getSeriesEditContext,
  type SeriesEditContext,
} from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";
import { zonedLocalInputValue } from "@/lib/timezone";
import {
  computeDates,
  formatPreview,
  localToIso,
  parseWall,
  type SeriesFrequency,
} from "@/lib/series-dates";

const MAX_OCCURRENCES = 52;

type Loaded = Extract<SeriesEditContext, { ok: true }>;

export function EditSeriesDialog({
  seriesId,
  clientId,
  triggerClassName,
}: {
  seriesId: string;
  clientId: string;
  /** Override the trigger button styling. */
  triggerClassName?: string;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [loading, startLoad] = useTransition();
  const [ctx, setCtx] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields (seeded from the loaded rule)
  const [firstLocal, setFirstLocal] = useState("");
  const [frequency, setFrequency] = useState<SeriesFrequency>("weekly");
  const [type, setType] = useState("Session");
  const [duration, setDuration] = useState("60");
  const [intention, setIntention] = useState("");
  const [countText, setCountText] = useState("8");
  const [locationType, setLocationType] = useState<"online" | "in_person">("online");
  const [notifyClient, setNotifyClient] = useState(true);

  function openDialog() {
    setOpen(true);
    setError(null);
    setLoadError(null);
    setCtx(null);
    startLoad(async () => {
      const r = await getSeriesEditContext(seriesId);
      if (!r.ok) {
        setLoadError(r.error);
        return;
      }
      setCtx(r);
      setFirstLocal(zonedLocalInputValue(new Date(r.nextAt), r.practiceTz));
      setFrequency(r.frequency);
      setType(r.type);
      setDuration(String(r.durationMinutes));
      setIntention(r.intention ?? "");
      setCountText(String(r.occurrenceCount));
      setLocationType(r.locationType);
      setNotifyClient(true);
    });
  }

  const tz = ctx?.practiceTz ?? "UTC";
  const nextIndex = ctx?.nextIndex ?? 1;
  const parsedCount = parseInt(countText, 10);
  const total = Number.isFinite(parsedCount)
    ? Math.min(Math.max(parsedCount, nextIndex), MAX_OCCURRENCES)
    : 0;
  const remaining = total >= nextIndex ? total - nextIndex + 1 : 0;

  const previewDates = useMemo(
    () => (remaining > 0 ? computeDates(firstLocal, frequency, remaining, tz) : []),
    [firstLocal, frequency, remaining, tz]
  );
  const lastDate = previewDates[previewDates.length - 1];

  // Keep the text box honest once the rule is known (e.g. she typed 3 but the
  // next occurrence is #8).
  useEffect(() => {
    if (!ctx) return;
    if (Number.isFinite(parsedCount) && parsedCount < nextIndex) {
      setCountText(String(nextIndex));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={triggerClassName ?? "text-[11px] text-plum-700 hover:underline"}
      >
        Edit series…
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Edit this series"
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
              form={formId}
              disabled={submitting || !ctx}
              aria-busy={submitting}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting
                ? "Saving…"
                : remaining > 0
                  ? `Apply to ${remaining} upcoming ${remaining === 1 ? "session" : "sessions"}`
                  : "Save changes"}
            </button>
          </>
        }
      >
        {loading && !ctx && !loadError && (
          <div className="text-sm text-ink-500">Loading the series…</div>
        )}
        {loadError && (
          <div className="text-sm text-ink-700 bg-honey-50 border border-honey-100 rounded p-3">
            {loadError}
          </div>
        )}
        {ctx && (
          <form
            id={formId}
            noValidate
            action={async (fd) => {
              setError(null);
              if (!parseWall(firstLocal)) {
                setError("Pick the next session's date and time.");
                return;
              }
              if (remaining < 1) {
                setError(
                  `Keep at least ${nextIndex} sessions in total — that's the one coming up.`
                );
                return;
              }
              setSubmitting(true);
              try {
                const result = await editSessionSeries(fd);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                notify({
                  kind: "success",
                  title: "Series updated",
                  body:
                    result.updated > 0
                      ? `${result.updated} upcoming ${result.updated === 1 ? "session" : "sessions"} follow the new shape.`
                      : "Nothing needed to change.",
                  ttlMs: 4000,
                });
                setOpen(false);
              } catch (err) {
                rethrowIfRedirect(err);
                setError(err instanceof Error ? err.message : "Couldn't update the series.");
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <input type="hidden" name="seriesId" value={seriesId} readOnly />
            <input type="hidden" name="clientId" value={clientId} readOnly />
            <input type="hidden" name="firstAt" value={localToIso(firstLocal, tz)} readOnly />
            <input
              type="hidden"
              name="computedDates"
              value={JSON.stringify(previewDates.map((d) => d.toISOString()))}
              readOnly
            />
            <input type="hidden" name="locationType" value={locationType} readOnly />
            <input type="hidden" name="occurrenceCount" value={total || ""} readOnly />
            <input type="hidden" name="notifyClient" value={notifyClient ? "true" : "false"} readOnly />

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
                {error}
              </div>
            )}

            <p className="text-xs text-ink-500 leading-relaxed">
              Changes apply from <strong>session #{nextIndex}</strong> onward. Sessions
              already held never change, and any upcoming one you&apos;ve moved or
              cancelled on its own stays exactly as you left it.
            </p>

            <Field
              label={`Next session (#${nextIndex})`}
              required
              hint="Move this and every later session shifts with it — same day of the week, same time. Change just the time to keep the day."
            >
              <input
                type="datetime-local"
                value={firstLocal}
                onChange={(e) => setFirstLocal(e.target.value)}
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Frequency">
                <select
                  name="frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as SeriesFrequency)}
                  className={inputCls}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              <Field label="Duration (min)">
                <input
                  name="durationMinutes"
                  type="number"
                  inputMode="numeric"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  min={5}
                  max={180}
                  step={5}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Session type">
                <input
                  name="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field
                label="Total sessions in the series"
                hint={`At least ${nextIndex} (the one coming up), at most ${MAX_OCCURRENCES}. Raise it to add sessions at the end; lower it to drop the last ones.`}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  value={countText}
                  onChange={(e) => setCountText(e.target.value)}
                  onBlur={() => {
                    if (total >= nextIndex) setCountText(String(total));
                  }}
                  min={nextIndex}
                  max={MAX_OCCURRENCES}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Intention (optional)" hint="Applies to every upcoming session in the series.">
              <input
                name="intention"
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                className={inputCls}
                placeholder="What this series is about, in their words if you have them"
              />
            </Field>

            <Field
              label="Where"
              hint={
                locationType === "in_person"
                  ? "No video link and no notetaker from here on — record each one in the room with “Record session”."
                  : "One shared Google Meet link for the upcoming sessions (generated when Google is connected)."
              }
            >
              <div className="inline-flex rounded-md border border-ink-200 overflow-hidden text-sm">
                {(
                  [
                    { key: "online", label: "Online" },
                    { key: "in_person", label: "In person" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setLocationType(opt.key)}
                    className={`px-4 py-1.5 transition ${
                      locationType === opt.key
                        ? "bg-ink-900 text-white"
                        : "bg-white text-ink-600 hover:bg-ink-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>

            <label className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyClient}
                onChange={(e) => setNotifyClient(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Email the client the updated schedule
                <span className="block text-xs text-ink-400">
                  One email with the new rhythm and the next dates — never a cancellation.
                  Untick for test series or when they already know.
                </span>
              </span>
            </label>

            {/* Preview of the new shape */}
            <div className="border border-ink-200 rounded-md bg-ink-50/40 p-3">
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-xs font-medium text-ink-700">
                  Upcoming ({previewDates.length}{" "}
                  {previewDates.length === 1 ? "session" : "sessions"})
                </div>
                {lastDate && (
                  <div className="text-[11px] text-ink-500">
                    Last one: {formatPreview(lastDate, tz)}
                  </div>
                )}
              </div>
              {previewDates.length > 0 ? (
                <ol className="text-xs text-ink-600 space-y-0.5 max-h-40 overflow-y-auto">
                  {previewDates.map((d, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono text-ink-400 w-8 shrink-0">
                        #{nextIndex + i}
                      </span>
                      {formatPreview(d, tz)}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="text-xs text-ink-400 italic">
                  Pick a valid next date and a total of at least {nextIndex}.
                </div>
              )}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
