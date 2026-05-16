"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { markSessionPaid } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";

export function MarkPaidDialog({
  sessionId,
  clientId,
  trigger,
}: {
  sessionId: string;
  clientId: string;
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-green-700 hover:underline font-medium"
        >
          Mark paid
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Mark this session paid"
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
              form="mark-paid-form"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Mark paid"}
            </button>
          </>
        }
      >
        <form
          id="mark-paid-form"
          action={async (fd) => {
            setSubmitting(true);
            setError(null);
            try {
              await markSessionPaid(fd);
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
          <input type="hidden" name="id" value={sessionId} />
          <input type="hidden" name="clientId" value={clientId} />

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

          <Field label="Method">
            <select name="paymentMethod" defaultValue="venmo" className={inputCls}>
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

          <Field label="Note (optional)" hint="e.g. confirmation # or 'paid in cash'">
            <input name="paymentNote" className={inputCls} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
