"use client";

// Edit an existing Circle's settings in one place — name, storefront
// description, seats, length, price + currency, payment instructions, and
// whether it's public. Opens from the "Edit" button on the group detail page,
// pre-filled, and submits to updateGroup (which revalidates in place — no
// redirect). Frequency lives in the separate "Weekly rhythm" panel.

import { useState } from "react";
import { Modal } from "./Modal";
import { updateGroup } from "@/lib/group-actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";

const CURRENCIES = [
  { v: "USD", label: "USD $" },
  { v: "CAD", label: "CAD $" },
  { v: "EUR", label: "EUR €" },
  { v: "GBP", label: "GBP £" },
];

export function EditGroupDialog({
  group,
}: {
  group: {
    id: string;
    name: string;
    description: string | null;
    defaultCapacity: number;
    defaultDurationMinutes: number;
    defaultPriceCents: number;
    defaultCurrency: string;
    paymentInstructions: string | null;
    published: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-2 text-sm border border-ink-200 bg-white hover:bg-ink-50 text-ink-700 rounded-md font-medium"
      >
        Edit Circle
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Circle settings"
        size="md"
      >
        <form
          action={async (fd) => {
            // Wrapped so the dialog closes on success and shows the reason on
            // failure — updateGroup revalidates in place (no redirect), so
            // handing it straight to `action=` left the dialog open forever.
            setSubmitting(true);
            setError(null);
            try {
              const result = await updateGroup(fd);
              if (result.ok) {
                setOpen(false);
                notify({ kind: "success", title: "Circle updated", ttlMs: 3000 });
              } else {
                setError(result.error);
              }
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
          <input type="hidden" name="id" value={group.id} />

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Name
            </span>
            <input
              type="text"
              name="name"
              required
              maxLength={200}
              defaultValue={group.name}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Description
            </span>
            <p className="text-[11px] text-ink-500 italic mt-0.5">
              Shown to visitors on your storefront.
            </p>
            <textarea
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={group.description ?? ""}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white resize-y"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Seats per Circle
              </span>
              <input
                type="number"
                name="defaultCapacity"
                defaultValue={group.defaultCapacity}
                min={2}
                max={500}
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Length (min)
              </span>
              <input
                type="number"
                name="defaultDurationMinutes"
                defaultValue={group.defaultDurationMinutes}
                min={15}
                max={480}
                step={15}
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Price
              </span>
              <input
                type="number"
                name="defaultPrice"
                defaultValue={(group.defaultPriceCents / 100).toString()}
                min={0}
                max={5000}
                step={1}
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Currency
              </span>
              <select
                name="defaultCurrency"
                defaultValue={group.defaultCurrency}
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Payment instructions
            </span>
            <p className="text-[11px] text-ink-500 italic mt-0.5">
              Shown to attendees who pay manually (Venmo/cash), not by card.
            </p>
            <textarea
              name="paymentInstructions"
              rows={2}
              maxLength={1000}
              defaultValue={group.paymentInstructions ?? ""}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white resize-y"
            />
          </label>

          <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
            <input
              type="checkbox"
              name="published"
              value="true"
              defaultChecked={group.published}
              className="rounded border-ink-300 mt-0.5"
            />
            <span className="text-sm text-ink-700 leading-snug">
              Public on my storefront
              <span className="block text-[11px] text-ink-500 italic mt-0.5">
                On = scheduled sessions appear in &ldquo;Upcoming Circles&rdquo;
                on svit.live. Off = private (the public page 404s); useful for
                invite-only circles.
              </span>
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="px-3 py-2 text-sm text-ink-600 hover:text-ink-900 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save Circle"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
