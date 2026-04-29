"use client";

import { useState, useTransition } from "react";
import {
  completeReading,
  cancelReading,
  deleteReading,
  updateReadingLog,
} from "@/lib/actions";
import type { Reading } from "@/db/schema";
import { readingTypeLabel, shortDate } from "@/lib/format";

const STATUS_CHIP: Record<string, string> = {
  scheduled: "bg-ink-100 text-ink-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-ink-100 text-ink-500",
  no_show: "bg-amber-50 text-amber-700",
};

export function ReadingCard({ reading }: { reading: Reading }) {
  const [open, setOpen] = useState(reading.status === "scheduled");
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<"cancel" | "delete" | null>(null);

  const isCompleted = reading.status === "completed";

  return (
    <div className="border border-ink-200 rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-ink-50 text-left"
      >
        <svg
          className={`w-3 h-3 text-ink-400 transition-transform ${
            open ? "rotate-90" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span className="font-mono text-xs text-ink-700 w-20">
          {shortDate(reading.scheduledAt)}
        </span>
        <span className="text-ink-600 text-sm flex-1">
          {readingTypeLabel(reading.type)} · {reading.durationMinutes}m
        </span>
        <span className="text-xs text-ink-500 italic truncate max-w-[40%]">
          {reading.intention ?? ""}
        </span>
        <span
          className={`chip ${STATUS_CHIP[reading.status] ?? "bg-ink-100 text-ink-500"}`}
        >
          {reading.status.toUpperCase()}
        </span>
      </button>

      {open && (
        <div className="border-t border-ink-100 px-4 py-4 bg-ink-50/40 text-sm">
          {reading.status === "scheduled" ? (
            <CompleteForm reading={reading} />
          ) : isCompleted ? (
            <CompletedView reading={reading} />
          ) : (
            <div className="text-ink-500 italic text-xs">
              {reading.status === "cancelled"
                ? "This reading was cancelled."
                : "No-show."}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-ink-100">
            {reading.status === "scheduled" && (
              <button
                onClick={() =>
                  setConfirming(confirming === "cancel" ? null : "cancel")
                }
                disabled={pending}
                className="text-xs text-ink-500 hover:text-ink-900"
              >
                {confirming === "cancel" ? "Tap again to confirm cancel" : "Cancel reading"}
              </button>
            )}
            {confirming === "cancel" && (
              <button
                onClick={() =>
                  start(() => cancelReading(reading.id).then(() => setConfirming(null)))
                }
                disabled={pending}
                className="text-xs text-amber-700 font-medium hover:underline"
              >
                Confirm
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() =>
                setConfirming(confirming === "delete" ? null : "delete")
              }
              disabled={pending}
              className="text-xs text-ink-400 hover:text-red-700"
            >
              {confirming === "delete" ? "Tap again to confirm delete" : "Delete"}
            </button>
            {confirming === "delete" && (
              <button
                onClick={() =>
                  start(() => deleteReading(reading.id).then(() => setConfirming(null)))
                }
                disabled={pending}
                className="text-xs text-red-700 font-medium hover:underline"
              >
                Confirm
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CompleteForm({ reading }: { reading: Reading }) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action={async (formData) => {
        setSubmitting(true);
        try {
          await completeReading(formData);
        } finally {
          setSubmitting(false);
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={reading.id} />

      <div>
        <label className="text-[10px] uppercase tracking-wider text-ink-500 block mb-1">
          Intention (in her own words)
        </label>
        <input
          name="intention"
          defaultValue={reading.intention ?? ""}
          className="ce-input"
          placeholder="What she said she wanted from this reading"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="border border-ink-200 bg-white rounded p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">
            Pre-reading check-in
          </div>
          <div className="space-y-2">
            <ScaleField name="preHeartOpen" label="Heart open" />
            <ScaleField name="preSelfLove" label="Self-love" />
            <div>
              <label className="text-[10px] text-ink-500 block">
                Body state
              </label>
              <input
                name="preBody"
                className="ce-input"
                placeholder="how she arrived"
              />
            </div>
          </div>
        </div>
        <div className="border border-ink-200 bg-white rounded p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">
            Post-reading check-in
          </div>
          <div className="space-y-2">
            <ScaleField name="postHeartOpen" label="Heart open" />
            <ScaleField name="postSelfLove" label="Self-love" />
            <div>
              <label className="text-[10px] text-ink-500 block">
                Body state
              </label>
              <input
                name="postBody"
                className="ce-input"
                placeholder="how she left"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-ink-500 block mb-1">
          Reading log
        </label>
        <textarea
          name="log"
          rows={6}
          className="ce-input"
          placeholder="What came through. What guides showed up. Energetic shifts. Client quotes. What you said. What to suggest between readings."
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Mark complete & save log"}
        </button>
      </div>

      <style>{`
        .ce-input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid var(--color-ink-200);
          border-radius: 4px;
          font-size: 13px;
          outline: none;
          background: white;
        }
        .ce-input:focus { border-color: var(--color-flame-600); }
      `}</style>
    </form>
  );
}

function ScaleField({ name, label }: { name: string; label: string }) {
  return (
    <div>
      <label className="text-[10px] text-ink-500 block">{label} (1–10)</label>
      <input
        name={name}
        type="number"
        min={1}
        max={10}
        className="ce-input"
        placeholder="—"
      />
    </div>
  );
}

function CompletedView({ reading }: { reading: Reading }) {
  const [editingLog, setEditingLog] = useState(false);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(reading.log ?? "");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-ink-200 bg-white rounded p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
            Pre-reading
          </div>
          <div className="text-xs text-ink-700 space-y-0.5">
            <div>
              Heart open <span className="font-mono">{reading.preHeartOpen ?? "—"}/10</span>
            </div>
            <div>
              Self-love <span className="font-mono">{reading.preSelfLove ?? "—"}/10</span>
            </div>
            <div>
              Body <span className="text-ink-600">{reading.preBody ?? "—"}</span>
            </div>
          </div>
        </div>
        <div className="border border-ink-200 bg-white rounded p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">
            Post-reading
          </div>
          <div className="text-xs text-ink-700 space-y-0.5">
            <div>
              Heart open <span className="font-mono">{reading.postHeartOpen ?? "—"}/10</span>
            </div>
            <div>
              Self-love <span className="font-mono">{reading.postSelfLove ?? "—"}/10</span>
            </div>
            <div>
              Body <span className="text-ink-600">{reading.postBody ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] uppercase tracking-wider text-ink-500">
            Reading log
          </div>
          {!editingLog ? (
            <button
              onClick={() => setEditingLog(true)}
              className="text-[10px] text-flame-700 hover:underline"
            >
              edit
            </button>
          ) : (
            <button
              onClick={() => {
                start(async () => {
                  await updateReadingLog(reading.id, draft);
                  setEditingLog(false);
                });
              }}
              disabled={pending}
              className="text-[10px] text-flame-700 hover:underline"
            >
              save
            </button>
          )}
        </div>
        {editingLog ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="w-full text-ink-700 leading-relaxed bg-white border border-ink-200 rounded p-3 text-sm outline-none focus:border-flame-600"
          />
        ) : (
          <div className="text-ink-700 leading-relaxed bg-white border border-ink-200 rounded p-3 whitespace-pre-wrap min-h-[2rem]">
            {reading.log ?? (
              <span className="text-ink-400 italic">
                [No log yet — click edit to write one]
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
