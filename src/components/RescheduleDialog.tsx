"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { rescheduleSession } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { LocalDateTimeInput } from "./LocalDateTimeInput";
import { zonedLocalInputValue } from "@/lib/timezone";
import { useTimeZone } from "./TimeZoneProvider";

// Reschedule a session — change date/time and optionally duration. If Google
// Calendar is connected, the event is updated and the client is notified.
export function RescheduleDialog({
  sessionId,
  clientId,
  currentScheduledAt,
  currentDurationMinutes,
}: {
  sessionId: string;
  clientId: string;
  currentScheduledAt: Date | string;
  currentDurationMinutes: number;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill the picker with the session's current wall-clock time IN THE
  // PRACTICE ZONE — the same zone the picker reads back. Using the viewer's
  // offset here would silently shift the session by their UTC difference the
  // moment she opened this dialog and hit Save without changing anything.
  const practiceTz = useTimeZone();
  const initialWhen = zonedLocalInputValue(
    typeof currentScheduledAt === "string"
      ? new Date(currentScheduledAt)
      : currentScheduledAt,
    practiceTz
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-500 hover:text-ink-900"
      >
        Reschedule
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Reschedule session"
        size="md"
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
              form="reschedule-form"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Rescheduling…" : "Reschedule"}
            </button>
          </>
        }
      >
        <form
          id="reschedule-form"
          action={async (fd) => {
            setSubmitting(true);
            setError(null);
            try {
              await rescheduleSession(fd);
              setOpen(false);
            } catch (err) {
              rethrowIfRedirect(err);
              setError(err instanceof Error ? err.message : "Failed");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={sessionId} />
          <input type="hidden" name="clientId" value={clientId} />

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

          <p className="text-xs text-ink-500">
            If Google Calendar is connected, the event will be updated and your
            client will get a &ldquo;rescheduled&rdquo; notification automatically.
          </p>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="New date &amp; time" required>
              <LocalDateTimeInput
                name="scheduledAt"
                required
                defaultValue={initialWhen}
                className={inputCls}
              />
            </Field>
            <Field label="Duration (min)">
              <input
                name="durationMinutes"
                type="number"
                defaultValue={currentDurationMinutes}
                min={15}
                max={180}
                step={15}
                className={`${inputCls} w-24`}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
