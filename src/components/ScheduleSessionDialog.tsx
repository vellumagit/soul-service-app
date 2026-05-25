"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { scheduleSession } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { LocalDateTimeInput } from "./LocalDateTimeInput";
import { notify } from "./FlashNotifier";

type ClientOption = { id: string; fullName: string };

// Default to next hour, formatted for datetime-local
function defaultWhen() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function ScheduleSessionDialog({
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
  // NOTE: Google sync failures used to keep the dialog open with an amber
  // warning — but that read as "save failed" to users and they'd retry, ending
  // up with duplicate sessions. Now the session save closes the dialog
  // immediately and Google sync failures surface as a bottom-screen flash via
  // FlashNotifier. The session IS saved — that's the primary success — and the
  // Meet/Calendar failure is a fixable secondary detail, not a reason to block.

  const noClients = clients.length === 0;

  // Keyboard shortcut `s` opens this dialog from anywhere.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("shortcuts:schedule-session", handler);
    return () =>
      window.removeEventListener("shortcuts:schedule-session", handler);
  }, []);

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-3 py-2 rounded-md inline-flex items-center gap-1.5"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Schedule session
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Schedule a session"
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
              form="schedule-session-form"
              disabled={submitting || noClients}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Scheduling…" : "Schedule"}
            </button>
          </>
        }
      >
        {noClients ? (
          <div className="text-sm text-ink-600">
            Add a client first — then come back here to schedule their session.
          </div>
        ) : (
          <form
            id="schedule-session-form"
            action={async (fd) => {
              setSubmitting(true);
              setError(null);
              try {
                const result = await scheduleSession(fd);
                // The session is saved regardless of Google sync status. Close
                // the dialog immediately so the practitioner doesn't think the
                // save failed.
                setOpen(false);
                if (result.googleWarning) {
                  // Tell her about the Google miss as a non-blocking flash —
                  // and include the ACTUAL Google error so she knows whether
                  // to reconnect, fix scopes, etc. Linking to /status lets
                  // her run the diagnostic + try the bulk catch-up button
                  // after fixing.
                  notify({
                    kind: "warning",
                    title: "Session saved — Google didn't sync",
                    body: `${result.googleWarning.slice(0, 220)} · Reconnect Google in Settings, then sync from Status.`,
                    actionHref: "/status",
                    actionLabel: "Diagnose",
                    ttlMs: 16000,
                  });
                } else {
                  notify({
                    kind: "success",
                    title: "Session scheduled",
                    ttlMs: 3500,
                  });
                }
              } catch (err) {
                rethrowIfRedirect(err);
                setError(err instanceof Error ? err.message : "Something went wrong");
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

            <Field label="Session type">
              <input
                name="type"
                defaultValue={defaultType ?? "Session"}
                className={inputCls}
                placeholder="Whatever you call this kind of session"
              />
            </Field>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Date & time" required>
                {/* LocalDateTimeInput submits an ISO string with her browser's
                    timezone applied — without this, the server would parse the
                    bare datetime-local string as UTC and shift the session by
                    her UTC offset. */}
                <LocalDateTimeInput
                  name="scheduledAt"
                  required
                  defaultValue={defaultWhen()}
                  className={inputCls}
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
                  className={`${inputCls} w-24`}
                />
              </Field>
            </div>

            <Field label="Google Meet link" hint="Paste the link after creating it in Google Meet">
              <input
                name="meetUrl"
                type="url"
                className={inputCls}
                placeholder="https://meet.google.com/..."
              />
            </Field>

            <Field label="What they're hoping for (optional)">
              <input
                name="intention"
                className={inputCls}
                placeholder="In their own words, if they shared something"
              />
            </Field>
          </form>
        )}
      </Modal>
    </>
  );
}
