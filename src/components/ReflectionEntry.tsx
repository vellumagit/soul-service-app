"use client";

// A single reflection row on /portal/reflections. Three states:
//
//   1. resting — shows body + date + optional session label + tiny
//      Edit / Delete actions
//   2. editing — textarea inline + Save / Cancel
//   3. just-deleted — fades away to make the deletion feel intentional
//      rather than abrupt
//
// The actions live in `lib/portal-reflection-actions.ts` (a separate
// "use server" module so this component can stay client-side).

import { useState, useTransition } from "react";
import {
  updateClientReflection,
  deleteClientReflection,
} from "@/lib/portal-reflection-actions";
import { fullDate } from "@/lib/format";

export function ReflectionEntry({
  id,
  body,
  createdAt,
  sessionLabel,
}: {
  id: string;
  body: string;
  createdAt: Date;
  sessionLabel: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  if (editing) {
    return (
      <li className="paper-card p-5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          maxLength={5000}
          disabled={pending}
          autoFocus
          className="w-full px-3 py-2.5 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y"
        />
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            disabled={pending || !draft.trim()}
            onClick={() =>
              startTransition(async () => {
                const r = await updateClientReflection(id, draft);
                if (r.ok) setEditing(false);
              })
            }
            className="px-3 py-1.5 text-xs bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setDraft(body);
              setEditing(false);
            }}
            className="px-3 py-1.5 text-xs text-ink-600 hover:text-ink-900"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="paper-card p-5">
      <p className="serif-italic text-base text-ink-800 leading-relaxed whitespace-pre-wrap" style={{ fontWeight: 400 }}>
        {body}
      </p>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mt-3">
        <p className="text-[11px] text-ink-500 italic">
          {fullDate(createdAt)}
          {sessionLabel && (
            <span className="text-ink-400"> · about {sessionLabel}</span>
          )}
        </p>
        <div className="flex items-center gap-3 text-[11px]">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-ink-500 hover:text-ink-900 hover:underline"
          >
            Edit
          </button>
          <span className="text-ink-300">·</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  "Delete this reflection? This can't be undone."
                )
              )
                return;
              startTransition(async () => {
                const r = await deleteClientReflection(id);
                if (r.ok) setRemoved(true);
              });
            }}
            className="text-ink-500 hover:text-red-700 hover:underline disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
