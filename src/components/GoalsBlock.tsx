"use client";

import { useState, useTransition } from "react";
import { addGoal, deleteGoal, updateGoalProgress } from "@/lib/actions";
import type { Goal } from "@/db/schema";

export function GoalsBlock({
  soulId,
  goals,
}: {
  soulId: string;
  goals: Goal[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {goals.length === 0 && !adding && (
        <div className="text-xs text-ink-400 italic">
          No goals yet. Add the first one she&apos;s working on.
        </div>
      )}

      {goals.map((g) => (
        <GoalRow key={g.id} goal={g} />
      ))}

      {adding ? (
        <AddGoalForm
          soulId={soulId}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-flame-700 hover:underline"
        >
          + add goal
        </button>
      )}
    </div>
  );
}

function GoalRow({ goal }: { goal: Goal }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-800">{goal.label}</span>
        <span className="font-mono text-[11px] text-ink-500">
          {goal.progress}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        defaultValue={goal.progress}
        onMouseUp={(e) => {
          const v = parseInt((e.target as HTMLInputElement).value, 10);
          if (v !== goal.progress) {
            start(() => updateGoalProgress(goal.id, v));
          }
        }}
        onTouchEnd={(e) => {
          const v = parseInt((e.target as HTMLInputElement).value, 10);
          if (v !== goal.progress) {
            start(() => updateGoalProgress(goal.id, v));
          }
        }}
        disabled={pending}
        className="w-full mt-1 accent-flame-600"
      />
      <div className="flex items-center justify-between gap-2">
        {goal.note && (
          <div className="text-[11px] text-ink-500 mt-0.5">{goal.note}</div>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setConfirming(!confirming)}
          className="text-[10px] text-ink-400 hover:text-red-700 opacity-0 group-hover:opacity-100"
        >
          {confirming ? "tap again" : "remove"}
        </button>
        {confirming && (
          <button
            onClick={() => start(() => deleteGoal(goal.id))}
            disabled={pending}
            className="text-[10px] text-red-700 font-medium hover:underline"
          >
            confirm
          </button>
        )}
      </div>
    </div>
  );
}

function AddGoalForm({
  soulId,
  onDone,
}: {
  soulId: string;
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
      className="border border-ink-200 rounded p-3 space-y-2 bg-white"
    >
      <input type="hidden" name="soulId" value={soulId} />
      <input
        name="label"
        required
        autoFocus
        placeholder="Goal in her own words"
        className="w-full px-2 py-1 border border-ink-200 rounded text-sm outline-none focus:border-flame-600"
      />
      <input
        name="note"
        placeholder="Status note (optional)"
        className="w-full px-2 py-1 border border-ink-200 rounded text-xs outline-none focus:border-flame-600"
      />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-ink-500">Start at</label>
        <input
          name="progress"
          type="number"
          defaultValue={0}
          min={0}
          max={100}
          className="w-16 px-2 py-0.5 border border-ink-200 rounded text-xs outline-none"
        />
        <span className="text-[10px] text-ink-500">%</span>
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
          className="text-xs bg-ink-900 text-white px-2 py-1 rounded font-medium disabled:opacity-60"
        >
          {submitting ? "…" : "add"}
        </button>
      </div>
    </form>
  );
}
