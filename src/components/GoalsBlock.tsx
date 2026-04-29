"use client";

import { useState, useTransition } from "react";
import { addGoal, deleteGoal, updateGoalProgress } from "@/lib/actions";
import type { Goal } from "@/db/schema";
import { ConfirmButton } from "./ConfirmButton";
import { Field, inputCls } from "./Form";

export function GoalsBlock({
  clientId,
  goals,
}: {
  clientId: string;
  goals: Goal[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {goals.length === 0 && !adding && (
        <div className="text-xs text-ink-400 italic">
          No goals yet. Track what they&apos;re working on.
        </div>
      )}

      {goals.map((g) => (
        <GoalRow key={g.id} goal={g} clientId={clientId} />
      ))}

      {adding ? (
        <AddGoalForm clientId={clientId} onDone={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-flame-700 hover:underline font-medium"
        >
          + Add goal
        </button>
      )}
    </div>
  );
}

function GoalRow({ goal, clientId }: { goal: Goal; clientId: string }) {
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState(goal.progress);

  return (
    <div className="group">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-800">{goal.label}</span>
        <span className="font-mono text-[11px] text-ink-500">
          {progress}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={progress}
        onChange={(e) => setProgress(parseInt(e.target.value, 10))}
        onMouseUp={() => {
          if (progress !== goal.progress)
            start(() => updateGoalProgress(goal.id, clientId, progress));
        }}
        onTouchEnd={() => {
          if (progress !== goal.progress)
            start(() => updateGoalProgress(goal.id, clientId, progress));
        }}
        disabled={pending}
        className="w-full mt-1 accent-flame-600"
      />
      <div className="flex items-center justify-between gap-2">
        {goal.note && (
          <div className="text-[11px] text-ink-500 mt-0.5">{goal.note}</div>
        )}
        <div className="flex-1" />
        <ConfirmButton
          label={
            <span className="text-[10px] text-ink-400 hover:text-red-700 opacity-0 group-hover:opacity-100">
              remove
            </span>
          }
          message={`Remove the goal "${goal.label}"?`}
          confirmLabel="Yes, remove"
          onConfirm={() => deleteGoal(goal.id, clientId)}
        />
      </div>
    </div>
  );
}

function AddGoalForm({
  clientId,
  onDone,
}: {
  clientId: string;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        try {
          await addGoal(fd);
          onDone();
        } finally {
          setSubmitting(false);
        }
      }}
      className="border border-ink-200 rounded-md p-3 space-y-3 bg-white"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Goal" required>
        <input
          name="label"
          required
          autoFocus
          placeholder="In their own words"
          className={inputCls}
        />
      </Field>
      <Field label="Status note (optional)">
        <input
          name="note"
          placeholder="Where they are with this"
          className={inputCls}
        />
      </Field>
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-ink-500">Start at</label>
        <input
          name="progress"
          type="number"
          defaultValue={0}
          min={0}
          max={100}
          className={`${inputCls} w-20`}
        />
        <span className="text-[11px] text-ink-500">%</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-ink-500"
        >
          cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="text-xs bg-ink-900 text-white px-3 py-1.5 rounded font-medium disabled:opacity-60"
        >
          {submitting ? "…" : "add"}
        </button>
      </div>
    </form>
  );
}
