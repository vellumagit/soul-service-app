"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { rescheduleSession } from "@/lib/actions";

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

  // Format Date → datetime-local string in the user's timezone
  const initialWhen = (() => {
    const d =
      typeof currentScheduledAt === "string"
        ? new Date(currentScheduledAt)
        : currentScheduledAt;
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  })();

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
            Updates the session in this app. Google Calendar sync is coming
            soon — for now, if you&apos;ve already invited the client to a
            Meet, remember to update that event yourself.
          </p>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="New date &amp; time" required>
              <input
                name="scheduledAt"
                type="datetime-local"
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
