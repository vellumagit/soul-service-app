"use client";

// Small dialog for creating a group. Opens from the /groups page "New
// group" button. Submits to createGroup which inserts and then redirects
// to the group's detail page.

import { useState } from "react";
import { Modal } from "./Modal";
import { createGroup } from "@/lib/group-actions";

export function NewGroupDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium"
      >
        + New group
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New group"
        size="md"
      >
        <form action={createGroup} className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Name
            </span>
            <input
              type="text"
              name="name"
              required
              maxLength={200}
              placeholder="The Circle"
              autoFocus
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Description (optional)
            </span>
            <p className="text-[11px] text-ink-500 italic mt-0.5">
              A short paragraph shown to visitors on your storefront.
            </p>
            <textarea
              name="description"
              rows={3}
              maxLength={4000}
              placeholder="A guided weekly group for women carrying a lot — one theme each week, gently held."
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white resize-y"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Capacity
              </span>
              <input
                type="number"
                name="defaultCapacity"
                defaultValue={20}
                min={2}
                max={500}
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Duration (min)
              </span>
              <input
                type="number"
                name="defaultDurationMinutes"
                defaultValue={120}
                min={15}
                max={480}
                step={15}
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Price ($)
              </span>
              <input
                type="number"
                name="defaultPrice"
                defaultValue={20}
                min={0}
                max={5000}
                step={1}
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Payment instructions
            </span>
            <p className="text-[11px] text-ink-500 italic mt-0.5">
              Shown to attendees after they sign up. e.g. &ldquo;Venmo @svit
              $20 with &lsquo;Circle&rsquo; in the note&rdquo;.
            </p>
            <textarea
              name="paymentInstructions"
              rows={2}
              maxLength={1000}
              placeholder="Venmo @svit-lana $20 — please include the session date."
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white resize-y"
            />
          </label>

          <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
            <input
              type="checkbox"
              name="published"
              value="true"
              defaultChecked
              className="rounded border-ink-300 mt-0.5"
            />
            <span className="text-sm text-ink-700 leading-snug">
              Publish on my storefront
              <span className="block text-[11px] text-ink-500 italic mt-0.5">
                When on, scheduled sessions appear in the &ldquo;Upcoming
                Circles&rdquo; list on svit.live for anyone to sign up.
              </span>
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm text-ink-600 hover:text-ink-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium"
            >
              Create group
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
