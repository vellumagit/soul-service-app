"use client";

import { useState, useTransition } from "react";

type Props = {
  value: string | null;
  placeholder?: string;
  multiline?: boolean;
  italic?: boolean;
  className?: string;
  onSave: (next: string | null) => Promise<void>;
};

// Inline-edit a field. Click → text becomes editable. Blur or Enter saves.
// Escape cancels. Empty string saves null.
export function EditableField({
  value,
  placeholder = "Click to edit",
  multiline = false,
  italic = false,
  className = "",
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  if (!editing) {
    const display = value && value.trim().length > 0 ? value : placeholder;
    const isPlaceholder = !value || value.trim().length === 0;
    return (
      <button
        onClick={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
        className={`text-left w-full hover:bg-ink-50 rounded px-1 -mx-1 ${
          italic ? "italic" : ""
        } ${isPlaceholder ? "text-ink-400" : ""} ${className}`}
      >
        {multiline ? (
          <span className="block whitespace-pre-wrap">{display}</span>
        ) : (
          <span>{display}</span>
        )}
      </button>
    );
  }

  function commit(next: string) {
    const cleaned = next.trim();
    const final = cleaned.length === 0 ? null : cleaned;
    if (final === value) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await onSave(final);
      setEditing(false);
    });
  }

  if (multiline) {
    return (
      <textarea
        autoFocus
        rows={5}
        disabled={pending}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
            commit(draft);
        }}
        className={`w-full border border-ink-300 rounded p-2 text-sm outline-none focus:border-flame-600 ${
          italic ? "italic" : ""
        } ${className}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <input
      autoFocus
      type="text"
      disabled={pending}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditing(false);
        if (e.key === "Enter") commit(draft);
      }}
      className={`border border-ink-300 rounded px-2 py-1 text-sm outline-none focus:border-flame-600 ${className}`}
      placeholder={placeholder}
    />
  );
}
