"use client";

// Move a session that was booked under the wrong client. Notes, transcript,
// payment and files travel with it; a recurring occurrence is detached from
// its series; any invoice is cleared (it named the wrong person). Upcoming
// online sessions get their calendar entry re-pointed — silently unless she
// ticks the box to tell the new client.

import { useId, useState, useTransition } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { getClientOptions, moveSessionToClient } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";

export function MoveSessionDialog({
  sessionId,
  clientId,
  upcoming,
  inSeries,
  hasInvoice,
}: {
  sessionId: string;
  clientId: string;
  upcoming: boolean;
  inSeries: boolean;
  hasInvoice: boolean;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [loading, startLoad] = useTransition();
  const [options, setOptions] = useState<{ id: string; fullName: string }[] | null>(null);
  const [target, setTarget] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setOpen(true);
    setError(null);
    setTarget("");
    if (!options) {
      startLoad(async () => {
        const r = await getClientOptions();
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setOptions(r.clients.filter((c) => c.id !== clientId));
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-xs text-ink-500 hover:text-ink-900"
      >
        Move to another client
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Move this session to another client"
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
              disabled={submitting || !target}
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
          action={async () => {
            setError(null);
            if (!target) {
              setError("Pick the client it belongs to.");
              return;
            }
            setSubmitting(true);
            try {
              const r = await moveSessionToClient(sessionId, clientId, target, { notifyClient });
              if (!r.ok) {
                setError(r.error);
                return;
              }
              notify({ kind: "success", title: "Session moved", ttlMs: 3000 });
              setOpen(false);
            } catch (err) {
              rethrowIfRedirect(err);
              setError(err instanceof Error ? err.message : "Couldn't move the session.");
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
          <Field label="Belongs to" required>
            {loading && !options ? (
              <div className="text-sm text-ink-500">Loading clients…</div>
            ) : (
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={inputCls}
              >
                <option value="">— choose —</option>
                {(options ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <ul className="text-xs text-ink-500 leading-relaxed space-y-1 list-disc pl-4">
            <li>Notes, transcript, payment and files go with it.</li>
            {inSeries && (
              <li>
                It leaves its recurring series (a series belongs to one client) and
                becomes a standalone session.
              </li>
            )}
            {hasInvoice && (
              <li>The invoice is cleared — it named the wrong person. Generate a fresh one after.</li>
            )}
            {upcoming && (
              <li>The calendar entry is re-pointed at the new client.</li>
            )}
          </ul>
          {upcoming && (
            <label className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyClient}
                onChange={(e) => setNotifyClient(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Email the new client the booking details
                <span className="block text-xs text-ink-400">
                  Off by default — you may want to reach out yourself first.
                </span>
              </span>
            </label>
          )}
        </form>
      </Modal>
    </>
  );
}
