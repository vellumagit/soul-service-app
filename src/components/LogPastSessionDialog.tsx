"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { logPastSession } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";

type ClientOption = { id: string; fullName: string };

// Default to "today at last hour" for datetime-local
function defaultWhen() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() - 1);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function LogPastSessionDialog({
  clients,
  defaultClientId,
  trigger,
}: {
  clients: ClientOption[];
  defaultClientId?: string;
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const noClients = clients.length === 0;

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="border border-ink-200 hover:bg-ink-50 text-ink-700 text-sm font-medium px-3 py-2 rounded-md"
        >
          Log a past session
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log a past session"
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
              form="log-past-form"
              disabled={submitting || noClients}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save session"}
            </button>
          </>
        }
      >
        {noClients ? (
          <div className="text-sm text-ink-600">
            Add a client first.
          </div>
        ) : (
          <form
            id="log-past-form"
            action={async (fd) => {
              setSubmitting(true);
              setError(null);
              try {
                await logPastSession(fd);
                setOpen(false);
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
            <p className="text-xs text-ink-500">
              For sessions that already happened. Records everything in one
              shot — including payment if it&apos;s already been received.
            </p>
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
                defaultValue="Session"
                className={inputCls}
                placeholder="Whatever you call this kind of session"
              />
            </Field>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="When did it happen?" required>
                <input
                  name="scheduledAt"
                  type="datetime-local"
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

            <Field label="What they wanted from it">
              <input
                name="intention"
                className={inputCls}
                placeholder="Their words if you have them"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="How they arrived">
                <input
                  name="arrivedAs"
                  className={inputCls}
                  placeholder="brief phrase"
                />
              </Field>
              <Field label="How they left">
                <input
                  name="leftAs"
                  className={inputCls}
                  placeholder="brief phrase"
                />
              </Field>
            </div>

            <Field label="Session notes" hint="Whatever you'd want to remember about this session">
              <textarea name="notes" rows={5} className={inputCls} />
            </Field>

            <div className="border-t border-ink-100 pt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-700 cursor-pointer">
                <input
                  type="checkbox"
                  name="paid"
                  checked={paid}
                  onChange={(e) => setPaid(e.target.checked)}
                  className="accent-flame-600 w-4 h-4"
                />
                Already paid
              </label>
              {paid && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Field label="Method">
                    <select
                      name="paymentMethod"
                      defaultValue="venmo"
                      className={inputCls}
                    >
                      <option value="venmo">Venmo</option>
                      <option value="zelle">Zelle</option>
                      <option value="etransfer">e-Transfer</option>
                      <option value="cash">Cash</option>
                      <option value="paypal">PayPal</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                  <Field label="Amount ($)">
                    <input
                      name="paymentAmount"
                      type="number"
                      step="1"
                      min={0}
                      placeholder="135"
                      className={inputCls}
                    />
                  </Field>
                </div>
              )}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
