"use client";

import { useState, useTransition } from "react";
import { addObservation, deleteObservation } from "@/lib/actions";
import type { Observation } from "@/db/schema";

export function ObservationsBlock({
  soulId,
  observations,
}: {
  soulId: string;
  observations: Observation[];
}) {
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="text-sm text-ink-700 space-y-2">
      {observations.length === 0 && !adding && (
        <div className="text-ink-400 italic text-xs">
          Nothing recorded yet. Drop in patterns you keep noticing.
        </div>
      )}

      <ul className="space-y-2 list-disc pl-4">
        {observations.map((o) => (
          <li key={o.id} className="group flex items-start gap-2">
            <span className="flex-1">{o.body}</span>
            <button
              onClick={() => start(() => deleteObservation(o.id))}
              disabled={pending}
              className="text-[10px] text-ink-400 hover:text-red-700 opacity-0 group-hover:opacity-100"
            >
              remove
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          action={async (fd) => {
            setSubmitting(true);
            try {
              await addObservation(fd);
              setAdding(false);
            } finally {
              setSubmitting(false);
            }
          }}
          className="border border-ink-200 rounded p-3 bg-white space-y-2"
        >
          <input type="hidden" name="soulId" value={soulId} />
          <textarea
            name="body"
            autoFocus
            required
            rows={2}
            placeholder="What you keep noticing across her readings"
            className="w-full px-2 py-1 border border-ink-200 rounded text-sm outline-none focus:border-flame-600"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-xs text-ink-500"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="text-xs bg-ink-900 text-white px-2 py-1 rounded font-medium disabled:opacity-60"
            >
              {submitting ? "…" : "add"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-flame-700 hover:underline"
        >
          + add observation
        </button>
      )}
    </div>
  );
}
