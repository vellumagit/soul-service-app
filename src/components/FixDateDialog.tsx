"use client";

// Correct the recorded date/time of a session that already happened — a typo
// in "Log a past session", or a completed / no-show / cancelled row. It's a
// record fix: no client email, no bot; the Google entry is moved silently.
// Upcoming sessions use Reschedule (which notifies) instead.

import { useId, useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { correctSessionDate } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { LocalDateTimeInput } from "./LocalDateTimeInput";
import { zonedLocalInputValue } from "@/lib/timezone";
import { useTimeZone } from "./TimeZoneProvider";
import { notify } from "./FlashNotifier";

export function FixDateDialog({
  sessionId,
  clientId,
  currentScheduledAt,
  currentDurationMinutes,
  triggerClassName,
}: {
  sessionId: string;
  clientId: string;
  currentScheduledAt: Date | string;
  currentDurationMinutes: number;
  /** Override the trigger button styling. */
  triggerClassName?: string;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
        onClick={() => setOpen(true)}
        className={triggerClassName ?? "text-xs text-ink-500 hover:text-ink-900"}
      >
        Fix date
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Fix the date of this session"
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
              {submitting ? "Saving…" : "Save"}
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
              const r = await correctSessionDate(fd);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              notify({ kind: "success", title: "Date fixed", ttlMs: 2500 });
              setOpen(false);
            } catch (err) {
              rethrowIfRedirect(err);
              setError(err instanceof Error ? err.message : "Couldn't change the date.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={sessionId} readOnly />
          <input type="hidden" name="clientId" value={clientId} readOnly />
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}
          <p className="text-xs text-ink-500 leading-relaxed">
            A record correction only — nothing is sent to the client, and notes,
            payment and the Closing stay as they are.
          </p>
          <Field label="Date & time" required>
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
              max={180}
              step={5}
              className={inputCls}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
