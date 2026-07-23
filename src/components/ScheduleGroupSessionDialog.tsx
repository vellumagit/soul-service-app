"use client";

// Schedule a single session under an existing group. The form is small:
// when, how long, topic for the night, Meet URL. Defaults come from the
// group's defaults (capacity, duration, price), but capacity/duration are
// overridable per-session.

import { useState } from "react";
import { Modal } from "./Modal";
import { scheduleGroupSession } from "@/lib/group-actions";
import { LocalDateTimeInput } from "./LocalDateTimeInput";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";

interface Props {
  groupId: string;
  groupName: string;
  defaultDurationMinutes: number;
  defaultCapacity: number;
}

function toLocalDatetimeValue(d: Date): string {
  // Format a Date as "YYYY-MM-DDTHH:mm" in the user's local time, which is
  // what <input type="datetime-local"> wants.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function ScheduleGroupSessionDialog({
  groupId,
  groupName,
  defaultDurationMinutes,
  defaultCapacity,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the next round hour, ~3 days out, so the picker shows
  // something useful immediately.
  const suggested = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(19, 0, 0, 0);
    return toLocalDatetimeValue(d);
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium"
      >
        + Schedule session
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title={`Schedule a ${groupName} session`}
        size="md"
      >
        <form
          action={async (fd) => {
            // Wrapped (rather than handing the server action straight to
            // `action=`) so the dialog can actually respond: close on success,
            // show the reason on failure. Before this, every outcome looked
            // identical — the dialog just sat there.
            setSubmitting(true);
            setError(null);
            try {
              const result = await scheduleGroupSession(fd);
              if (result.ok) {
                setOpen(false);
                notify({
                  kind: "success",
                  title: "Circle session scheduled",
                  ttlMs: 3500,
                });
              } else {
                setError(result.error);
              }
            } catch (err) {
              rethrowIfRedirect(err);
              setError(
                err instanceof Error ? err.message : "Something went wrong"
              );
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="groupId" value={groupId} />

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              When
            </span>
            {/* LocalDateTimeInput submits a tz-aware ISO string. A raw
                datetime-local sends "2026-07-26T19:00" with no zone, which the
                UTC server read as 19:00 UTC — putting a 7pm circle at 1pm
                Edmonton. */}
            <LocalDateTimeInput
              name="scheduledAt"
              required
              defaultValue={suggested}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Duration (min)
              </span>
              <input
                type="number"
                name="durationMinutes"
                defaultValue={defaultDurationMinutes}
                min={15}
                max={480}
                step={15}
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Capacity
              </span>
              <input
                type="number"
                name="capacity"
                defaultValue={defaultCapacity}
                min={2}
                max={500}
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Topic (optional)
            </span>
            <p className="text-[11px] text-ink-500 italic mt-0.5">
              The theme for this specific evening, e.g. &ldquo;boundaries&rdquo;
              or &ldquo;the inner critic&rdquo;.
            </p>
            <input
              type="text"
              name="topic"
              maxLength={500}
              placeholder="The theme of the evening"
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Meet / Zoom URL (optional)
            </span>
            <input
              type="url"
              name="meetUrl"
              maxLength={500}
              placeholder="https://meet.google.com/..."
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="px-3 py-2 text-sm text-ink-600 hover:text-ink-900 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Scheduling…" : "Schedule"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
