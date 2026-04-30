"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  addTask,
  toggleTaskComplete,
  deleteTask,
} from "@/lib/actions";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { ConfirmButton } from "./ConfirmButton";
import { shortDateTime } from "@/lib/format";

// Loose row type — TasksBlock works for both full Task rows and slim
// dashboard rows that only carry the fields it actually uses.
export type TaskRow = {
  id: string;
  title: string;
  body?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  clientId?: string | null;
  clientName?: string | null;
  source?: string;
};

export function TasksBlock({
  clientId,
  tasks,
  emptyText = "No tasks yet.",
}: {
  clientId?: string;
  tasks: TaskRow[];
  emptyText?: string;
}) {
  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);
  const [showDone, setShowDone] = useState(false);

  return (
    <div className="space-y-2">
      {open.length === 0 && done.length === 0 && (
        <div className="text-xs text-ink-400 italic">{emptyText}</div>
      )}

      <ul className="space-y-1">
        {open.map((t) => (
          <TaskRowItem key={t.id} task={t} showClient={!clientId} />
        ))}
      </ul>

      <div className="flex items-center gap-3 pt-2">
        <AddTaskInline clientId={clientId} />
        {done.length > 0 && (
          <button
            onClick={() => setShowDone(!showDone)}
            className="text-xs text-ink-500 hover:text-ink-900 ml-auto"
          >
            {showDone ? "Hide" : "Show"} {done.length} completed
          </button>
        )}
      </div>

      {showDone && done.length > 0 && (
        <ul className="space-y-1 pt-2 border-t border-ink-100">
          {done.map((t) => (
            <TaskRowItem key={t.id} task={t} showClient={!clientId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRowItem({
  task,
  showClient,
}: {
  task: TaskRow;
  showClient: boolean;
}) {
  const [pending, start] = useTransition();
  const isDone = !!task.completedAt;
  const isOverdue =
    !isDone && task.dueAt && new Date(task.dueAt) < new Date();

  return (
    <li className="group flex items-start gap-2.5 py-1">
      <button
        onClick={() => start(() => toggleTaskComplete(task.id, task.clientId ?? null))}
        disabled={pending}
        className={`mt-0.5 w-4 h-4 rounded border ${
          isDone
            ? "bg-green-600 border-green-600"
            : "border-ink-300 hover:border-flame-600"
        } flex items-center justify-center shrink-0`}
        aria-label={isDone ? "Mark incomplete" : "Mark complete"}
      >
        {isDone && (
          <svg
            className="w-2.5 h-2.5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0 text-sm">
        <div
          className={`${isDone ? "text-ink-400 line-through" : "text-ink-900"}`}
        >
          {task.title}
          {task.source === "rule" && !isDone && (
            <span className="ml-2 text-[9px] uppercase tracking-wider text-ink-400">
              auto
            </span>
          )}
        </div>
        {(task.body || task.dueAt || (showClient && task.clientName)) && (
          <div className="text-[11px] text-ink-500 mt-0.5 flex flex-wrap items-center gap-2">
            {task.dueAt && (
              <span className={isOverdue ? "text-red-700 font-medium" : ""}>
                {isOverdue ? "Overdue · " : "Due "}
                {shortDateTime(task.dueAt)}
              </span>
            )}
            {showClient && task.clientName && (
              <Link
                href={`/clients/${task.clientId}`}
                className="text-ink-600 hover:text-flame-700"
              >
                {task.clientName}
              </Link>
            )}
            {task.body && <span className="text-ink-500">· {task.body}</span>}
          </div>
        )}
      </div>
      <ConfirmButton
        label={
          <span className="text-[10px] text-ink-400 hover:text-red-700 opacity-0 group-hover:opacity-100">
            delete
          </span>
        }
        message={`Delete the task "${task.title}"?`}
        confirmLabel="Yes, delete"
        onConfirm={() => deleteTask(task.id, task.clientId ?? null)}
      />
    </li>
  );
}

function AddTaskInline({ clientId }: { clientId?: string }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-flame-700 hover:underline font-medium"
      >
        + Add task
      </button>
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Add a task"
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
            form="add-task-form"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
          >
            {submitting ? "Adding…" : "Add task"}
          </button>
        </>
      }
    >
      <form
        id="add-task-form"
        action={async (fd) => {
          setSubmitting(true);
          try {
            await addTask(fd);
            setOpen(false);
          } finally {
            setSubmitting(false);
          }
        }}
        className="space-y-3"
      >
        {clientId && (
          <input type="hidden" name="clientId" value={clientId} />
        )}
        <Field label="Task" required>
          <input
            name="title"
            required
            autoFocus
            className={inputCls}
            placeholder="What needs doing?"
          />
        </Field>
        <Field label="Due (optional)">
          <input
            name="dueAt"
            type="datetime-local"
            className={inputCls}
          />
        </Field>
        <Field label="Notes (optional)">
          <input name="body" className={inputCls} />
        </Field>
      </form>
    </Modal>
  );
}
