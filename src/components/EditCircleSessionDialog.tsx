"use client";

// Edit an upcoming Circle session in place: topic, length, seats, price and —
// when the Circle isn't on Google Calendar — the meeting link. Changing the
// TIME stays with "Move to another time", which owns the "moved" emails.
// Before this, fixing anything on a scheduled Circle meant cancelling it
// (emailing every guest) and scheduling it again.

import { useId, useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { updateGroupSessionDetails } from "@/lib/group-actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";
import { useSubmitOnce } from "@/lib/useSubmitOnce";

export function EditCircleSessionDialog({
  sessionId,
  topic,
  durationMinutes,
  capacity,
  priceCents,
  currency,
  meetUrl,
  onGoogleCalendar,
  guestCount,
  hasPaidGuests,
}: {
  sessionId: string;
  topic: string | null;
  durationMinutes: number;
  capacity: number;
  priceCents: number;
  currency: string;
  meetUrl: string | null;
  /** The session has a Google Calendar event — its Meet link comes from Google. */
  onGoogleCalendar: boolean;
  guestCount: number;
  hasPaidGuests: boolean;
}) {
  const formId = useId();
  const submitOnce = useSubmitOnce();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        Edit details
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Edit this Circle"
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
          {...submitOnce(async (fd) => {
            setError(null);
            setSubmitting(true);
            try {
              const r = await updateGroupSessionDetails(fd);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              notify({
                kind: "success",
                title: "Circle updated",
                body:
                  r.confirmed > 0
                    ? `It's free now — ${r.confirmed} ${r.confirmed === 1 ? "person who was waiting is" : "people who were waiting are"} confirmed and emailed the link.`
                    : "Nobody was emailed.",
                ttlMs: 5000,
              });
              setOpen(false);
            } catch (err) {
              rethrowIfRedirect(err);
              setError(err instanceof Error ? err.message : "Couldn't save the changes.");
            } finally {
              setSubmitting(false);
            }
          })}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={sessionId} readOnly />
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}
          <p className="text-xs text-ink-500 leading-relaxed">
            Saving doesn&apos;t email anyone. To change the date or time, use
            &ldquo;Move to another time&rdquo; — that one tells your guests.
          </p>

          <Field label="Topic for the night">
            <input
              name="topic"
              type="text"
              defaultValue={topic ?? ""}
              maxLength={300}
              placeholder="The theme of the evening"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Length (min)">
              <input
                name="durationMinutes"
                type="number"
                inputMode="numeric"
                defaultValue={durationMinutes}
                min={5}
                max={480}
                step={5}
                className={inputCls}
              />
            </Field>
            <Field label="Seats">
              <input
                name="capacity"
                type="number"
                inputMode="numeric"
                defaultValue={capacity}
                min={Math.max(1, guestCount)}
                max={500}
                step={1}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label={`Price (${currency})`}>
            <input
              name="price"
              type="number"
              inputMode="decimal"
              defaultValue={(priceCents / 100).toString()}
              min={0}
              max={5000}
              step={1}
              disabled={hasPaidGuests}
              className={inputCls}
            />
            <span className="block text-[11px] text-ink-400 mt-1 leading-snug">
              {hasPaidGuests
                ? "Someone has already paid, so the price is locked."
                : "0 = free: anyone with the link signs up and gets in straight away. Anyone still waiting is let in when you save."}
            </span>
          </Field>

          <Field label="Meet / Zoom link">
            {onGoogleCalendar ? (
              <p className="text-[12px] text-ink-600 leading-relaxed">
                {meetUrl ? (
                  <a href={meetUrl} target="_blank" rel="noreferrer" className="text-plum-700 underline break-all">
                    {meetUrl}
                  </a>
                ) : (
                  "Comes from the Google Calendar event."
                )}
                <span className="block text-[11px] text-ink-400 mt-1">
                  This Circle is on your Google Calendar, so it uses that event&apos;s
                  own Meet link — guests on the invite walk straight in.
                </span>
              </p>
            ) : (
              <input
                name="meetUrl"
                type="url"
                defaultValue={meetUrl ?? ""}
                maxLength={500}
                placeholder="https://meet.google.com/..."
                className={inputCls}
              />
            )}
          </Field>
        </form>
      </Modal>
    </>
  );
}
