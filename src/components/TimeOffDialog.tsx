"use client";

// Block out a range she's away. Previews exactly what it will cancel (every
// upcoming session in the range, grouped by client — including recurring
// dates the calendar hasn't created yet), then applies it in one go: sessions
// cancelled, series gaps pinned, bookings inside the range refused, and one
// email per client listing their dates and when she's back.

import { useEffect, useId, useState, useTransition } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { applyTimeOff, previewTimeOff, type TimeOffPreview } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";
import { useTimeZone } from "./TimeZoneProvider";
import { zonedWallTimeToUtc } from "@/lib/timezone";

function dayBoundsIso(fromDate: string, toDate: string, tz: string) {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromDate);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toDate);
  if (!f || !t) return null;
  const from = zonedWallTimeToUtc(+f[1], +f[2] - 1, +f[3], 0, 0, tz);
  const to = zonedWallTimeToUtc(+t[1], +t[2] - 1, +t[3], 23, 59, tz);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}

export function TimeOffDialog() {
  const formId = useId();
  const tz = useTimeZone();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [note, setNote] = useState("");
  const [notifyClients, setNotifyClients] = useState(true);
  const [preview, setPreview] = useState<TimeOffPreview | null>(null);
  const [previewing, startPreview] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bounds = dayBoundsIso(fromDate, toDate, tz);

  // Re-preview whenever the range changes (both dates valid).
  useEffect(() => {
    if (!open || !bounds) {
      setPreview(null);
      return;
    }
    const { from, to } = bounds;
    startPreview(async () => {
      const r = await previewTimeOff(from, to);
      setPreview(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bounds?.from, bounds?.to]);

  const hits = preview?.ok ? preview.sessions : [];
  const grouped = new Map<string, { name: string; dates: string[] }>();
  for (const h of hits) {
    const g = grouped.get(h.clientId) ?? { name: h.clientName, dates: [] };
    g.dates.push(h.scheduledAt);
    grouped.set(h.clientId, g);
  }
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        className="border border-ink-200 hover:bg-ink-50 text-ink-700 text-sm font-medium px-3 py-2 rounded-md"
        title="Block out days you're away — cancels what's inside and stops new bookings there."
      >
        Time off…
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Time off"
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
              form={formId}
              disabled={submitting || !bounds}
              aria-busy={submitting}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting
                ? "Applying…"
                : hits.length > 0
                  ? `Block it — cancel ${hits.length} ${hits.length === 1 ? "session" : "sessions"}`
                  : "Block these days"}
            </button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          action={async (fd) => {
            setError(null);
            if (!bounds) {
              setError("Pick a start and an end date.");
              return;
            }
            setSubmitting(true);
            try {
              const r = await applyTimeOff(fd);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              notify({
                kind: "success",
                title: "Time off applied",
                body:
                  r.cancelled > 0
                    ? `${r.cancelled} ${r.cancelled === 1 ? "session" : "sessions"} cancelled across ${r.clients} ${r.clients === 1 ? "client" : "clients"}${r.emailed > 0 ? ` · ${r.emailed} emailed` : ""}. New bookings in that range are blocked.`
                    : "Nothing was scheduled in that range. New bookings inside it are blocked.",
                ttlMs: 6000,
              });
              setOpen(false);
              setFromDate("");
              setToDate("");
              setNote("");
            } catch (err) {
              rethrowIfRedirect(err);
              setError(err instanceof Error ? err.message : "Couldn't apply the time off.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="from" value={bounds?.from ?? ""} readOnly />
          <input type="hidden" name="to" value={bounds?.to ?? ""} readOnly />
          <input type="hidden" name="notifyClients" value={notifyClients ? "true" : "false"} readOnly />

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="First day off" required>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Last day off" required>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field
            label="Note for clients (optional)"
            hint='Goes into their email after the dates — e.g. "family trip". Leave blank to just say you’re away.'
          >
            <input
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              maxLength={120}
            />
          </Field>

          <label className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyClients}
              onChange={(e) => setNotifyClients(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Email each affected client once
              <span className="block text-xs text-ink-400">
                Their cancelled dates and when you&apos;re back — one email per client,
                not one per session. Google sends nothing.
              </span>
            </span>
          </label>

          {/* What this will do */}
          <div className="border border-ink-200 rounded-md bg-ink-50/40 p-3">
            {!bounds ? (
              <div className="text-xs text-ink-400 italic">
                Pick the first and last day to see what&apos;s inside.
              </div>
            ) : previewing && !preview ? (
              <div className="text-xs text-ink-500">Checking the calendar…</div>
            ) : preview && !preview.ok ? (
              <div className="text-xs text-red-700">{preview.error}</div>
            ) : hits.length === 0 ? (
              <div className="text-xs text-ink-600">
                Nothing is scheduled in that range. Blocking it still stops new bookings there.
              </div>
            ) : (
              <>
                <div className="text-xs font-medium text-ink-700 mb-2">
                  {hits.length} {hits.length === 1 ? "session" : "sessions"} across{" "}
                  {grouped.size} {grouped.size === 1 ? "client" : "clients"} will be cancelled
                </div>
                <ul className="text-xs text-ink-600 space-y-2 max-h-48 overflow-y-auto">
                  {[...grouped.values()].map((g) => (
                    <li key={g.name}>
                      <div className="font-medium text-ink-800">{g.name}</div>
                      <div className="text-ink-500">{g.dates.map(fmt).join(" · ")}</div>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-ink-400 mt-2">
                  Recurring series skip these dates and continue afterwards. Each cancelled
                  session can be restored from its card if plans change.
                </p>
              </>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
