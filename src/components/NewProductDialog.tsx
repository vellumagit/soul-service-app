"use client";

// Create a new video offering. Same shape as NewGroupDialog — the action
// redirects to the new product's detail page after insert, where she
// uploads the video.

import { useState } from "react";
import { Modal } from "./Modal";
import { createProduct } from "@/lib/product-actions";

export function NewProductDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium"
      >
        + New offering
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New offering"
        size="md"
      >
        <form action={createProduct} className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Name
            </span>
            <input
              type="text"
              name="name"
              required
              maxLength={200}
              placeholder="Becoming Soft — a recorded workshop"
              autoFocus
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Description
            </span>
            <p className="text-[11px] text-ink-500 italic mt-0.5">
              Shown to visitors on the storefront card and the offering page.
            </p>
            <textarea
              name="description"
              rows={3}
              maxLength={4000}
              placeholder="A two-hour gathering on holding hard things gently. Recorded live, available to revisit anytime."
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white resize-y"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Price ($)
            </span>
            <input
              type="number"
              name="price"
              defaultValue={40}
              min={0}
              max={5000}
              step={1}
              className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Payment instructions
            </span>
            <p className="text-[11px] text-ink-500 italic mt-0.5">
              Sent to the buyer in their confirmation when you mark them paid.
            </p>
            <textarea
              name="paymentInstructions"
              rows={2}
              maxLength={1000}
              placeholder="Venmo @svit-lana $40 — please include the offering name."
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white resize-y"
            />
          </label>

          <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
            <input
              type="checkbox"
              name="published"
              value="true"
              className="rounded border-ink-300 mt-0.5"
            />
            <span className="text-sm text-ink-700 leading-snug">
              Publish on storefront
              <span className="block text-[11px] text-ink-500 italic mt-0.5">
                Off by default — turn this on AFTER uploading the video so
                buyers don&apos;t hit a "not ready yet" message.
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
              Create offering
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
