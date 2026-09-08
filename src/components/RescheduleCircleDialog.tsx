"use client";

// Move a Circle to a new time. Seats are kept; guests get one "moved" email
// (Google stays silent); reminders reset for the new time. Replaces cancel +
// recreate + everyone signing up again.

import { useId, useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { rescheduleGroupSession } from "@/lib/group-actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { LocalDateTimeInput } from "./LocalDateTimeInput";
import { zonedLocalInputValue } from "@/lib/timezone";
import { useTimeZone } from "./TimeZoneProvider";
import { notify } from "./FlashNotifier";

export function RescheduleCircleDialog({
  sessionId,
  currentScheduledAt,
  currentDurationMinutes,
  guestCount,
}: {
  sessionId: string;
  currentScheduledAt: Date | string;
  currentDurationMinutes: number;
  guestCount: number;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notifyGuests, setNotifyGuests] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        className="text-[11px] text-ink-500 hover:text-ink-900"
      >
        Move to another time
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Move this Circle"
        size="sm"
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
              disabled={submitting}
              aria-busy={submitting}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Moving…" : "Move it"}
            </button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          action={async (fd) => {
            setError(null);
            setSubmitting(true);
            try {
              const r = await rescheduleGroupSession(fd);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              notify({
                kind: "success",
                title: "Circle moved",
                body:
                  r.notified > 0
                    ? `${r.notified} ${r.notified === 1 ? "guest" : "guests"} emailed the new time. Seats kept.`
                    : "Seats kept. Nobody was emailed.",
                ttlMs: 5000,
              });
              setOpen(false);
            } catch (err) {
              rethrowIfRedirect(err);
              setError(err instanceof Error ? err.message : "Couldn't move the Circle.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={sessionId} readOnly />
          <input type="hidden" name="notifyAttendees" value={notifyGuests ? "true" : "false"} readOnly />
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}
          <p className="text-xs text-ink-500 leading-relaxed">
            Everyone keeps their seat. Reminders and the &ldquo;we&rsquo;re starting&rdquo;
            nudge reset for the new time; the calendar entry updates quietly.
          </p>
          <Field label="New date & time" required>
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
              inputMode="numeric"
              defaultValue={currentDurationMinutes}
              min={5}
              max={480}
              step={5}
              className={inputCls}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyGuests}
              onChange={(e) => setNotifyGuests(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Email the {guestCount} {guestCount === 1 ? "guest" : "guests"} the new time
              <span className="block text-xs text-ink-400">
                One email each, with the meeting link — and a cancel/refund link for anyone
                who paid, in case the new time doesn&apos;t suit.
              </span>
            </span>
          </label>
        </form>
      </Modal>
    </>
  );
}
