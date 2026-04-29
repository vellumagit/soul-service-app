"use client";

import { useState, useTransition } from "react";

type Tag = { id: string; label: string };

export function TagListBlock({
  soulId,
  tags,
  onAdd,
  onDelete,
  emptyText,
}: {
  soulId: string;
  tags: Tag[];
  onAdd: (formData: FormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  emptyText: string;
}) {
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {tags.length === 0 && !adding && (
        <span className="text-xs text-ink-400 italic">{emptyText}</span>
      )}

      {tags.map((t) => (
        <span
          key={t.id}
          className="chip bg-ink-100 text-ink-700 group flex items-center gap-1"
        >
          {t.label}
          <button
            onClick={() => start(() => onDelete(t.id))}
            disabled={pending}
            className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-red-700"
            title="Remove"
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <form
          action={async (fd) => {
            setSubmitting(true);
            try {
              await onAdd(fd);
              setAdding(false);
            } finally {
              setSubmitting(false);
            }
          }}
          className="flex items-center gap-1"
        >
          <input type="hidden" name="soulId" value={soulId} />
          <input
            name="label"
            autoFocus
            required
            disabled={submitting}
            placeholder="new tag"
            className="px-2 py-0.5 border border-ink-300 rounded text-xs outline-none focus:border-flame-600 w-32"
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <button
            type="submit"
            disabled={submitting}
            className="text-[10px] text-flame-700 font-medium"
          >
            {submitting ? "…" : "add"}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-[10px] text-ink-400"
          >
            cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-flame-700 hover:underline"
        >
          + add
        </button>
      )}
    </div>
  );
}
