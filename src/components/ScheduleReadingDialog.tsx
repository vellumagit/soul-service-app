"use client";

import { useRef, useState } from "react";
import { scheduleReading } from "@/lib/actions";

const READING_TYPES = [
  { value: "soul_reading", label: "Soul reading" },
  { value: "heart_clearing", label: "Heart clearing" },
  { value: "ancestral_reading", label: "Ancestral reading" },
  { value: "love_alignment", label: "Love alignment" },
  { value: "inner_child", label: "Inner child" },
  { value: "forgiveness_ritual", label: "Forgiveness ritual" },
  { value: "first_reading_intake", label: "First reading + intake" },
  { value: "reconnection_call", label: "Reconnection call" },
  { value: "cord_cutting", label: "Cord-cutting ritual" },
];

export function ScheduleReadingDialog({
  soulId,
  defaultType,
  trigger,
}: {
  soulId: string;
  defaultType?: string | null;
  trigger?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function open() {
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  // Default to next hour
  const defaultWhen = (() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  })();

  return (
    <>
      <span onClick={open} className="inline-block">
        {trigger ?? (
          <button className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded">
            Schedule reading
          </button>
        )}
      </span>
      <dialog
        ref={dialogRef}
        className="rounded-md border border-ink-200 shadow-2xl p-0 backdrop:bg-ink-900/40 max-w-md w-full"
      >
        <form
          action={async (formData) => {
            setSubmitting(true);
            try {
              await scheduleReading(formData);
              close();
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <input type="hidden" name="soulId" value={soulId} />
          <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
            <div className="text-sm font-medium text-ink-900">
              Schedule reading
            </div>
            <button
              type="button"
              onClick={close}
              className="text-ink-400 hover:text-ink-800"
            >
              ✕
            </button>
          </div>
          <div className="p-5 space-y-3 text-sm">
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Reading type
              </label>
              <select
                name="type"
                defaultValue={defaultType ?? "soul_reading"}
                className="input"
              >
                {READING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <label className="block text-xs text-ink-500 mb-1">
                  Date / time
                </label>
                <input
                  name="scheduledAt"
                  type="datetime-local"
                  required
                  defaultValue={defaultWhen}
                  className="input"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs text-ink-500 mb-1">
                  Duration (m)
                </label>
                <input
                  name="durationMinutes"
                  type="number"
                  defaultValue={60}
                  min={15}
                  max={180}
                  step={15}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Intention (optional, can fill in later)
              </label>
              <input
                name="intention"
                className="input"
                placeholder="In her own words"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Google Meet URL (optional)
              </label>
              <input
                name="meetUrl"
                type="url"
                className="input"
                placeholder="https://meet.google.com/..."
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-100 bg-ink-50/40">
            <button
              type="button"
              onClick={close}
              className="px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 text-xs bg-ink-900 hover:bg-ink-800 text-white rounded font-medium disabled:opacity-60"
            >
              {submitting ? "Scheduling…" : "Schedule"}
            </button>
          </div>
        </form>
      </dialog>
      <style>{`
        .input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid var(--color-ink-200);
          border-radius: 4px;
          font-size: 13px;
          outline: none;
        }
        .input:focus { border-color: var(--color-flame-600); }
      `}</style>
    </>
  );
}
