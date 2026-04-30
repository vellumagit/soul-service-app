"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Template = { id: string; name: string; body: string };

// Markdown editor: textarea + toolbar (B / I / list / heading / link) + preview toggle.
// Wraps current selection. Saves as plain markdown text.
export function NotesEditor({
  name,
  defaultValue,
  templates = [],
  rows = 8,
  placeholder,
  onChange,
}: {
  name?: string;
  defaultValue?: string;
  templates?: Template[];
  rows?: number;
  placeholder?: string;
  onChange?: (val: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(defaultValue ?? "");
  const [mode, setMode] = useState<"write" | "preview">("write");

  function update(v: string) {
    setValue(v);
    onChange?.(v);
  }

  function wrap(prefix: string, suffix = prefix) {
    const t = ref.current;
    if (!t) return;
    const start = t.selectionStart;
    const end = t.selectionEnd;
    const before = value.slice(0, start);
    const sel = value.slice(start, end);
    const after = value.slice(end);
    const next = before + prefix + sel + suffix + after;
    update(next);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  }

  function prefix(p: string) {
    const t = ref.current;
    if (!t) return;
    const start = t.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const next = value.slice(0, lineStart) + p + value.slice(lineStart);
    update(next);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(start + p.length, start + p.length);
    });
  }

  function insertTemplate(template: Template) {
    const t = ref.current;
    if (!t) return;
    const start = t.selectionStart ?? value.length;
    const end = t.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const sep = before.length > 0 && !before.endsWith("\n") ? "\n\n" : "";
    const next = before + sep + template.body + "\n\n" + after;
    update(next);
    requestAnimationFrame(() => t.focus());
  }

  return (
    <div className="border border-ink-200 rounded-md bg-white overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-ink-100 bg-ink-50/50 flex-wrap">
        <ToolbarButton
          onClick={() => wrap("**")}
          title="Bold (⌘B)"
          label={<span className="font-bold">B</span>}
        />
        <ToolbarButton
          onClick={() => wrap("_")}
          title="Italic (⌘I)"
          label={<span className="italic">I</span>}
        />
        <Sep />
        <ToolbarButton
          onClick={() => prefix("# ")}
          title="Heading"
          label={<span className="text-xs font-semibold">H1</span>}
        />
        <ToolbarButton
          onClick={() => prefix("## ")}
          title="Subheading"
          label={<span className="text-xs font-semibold">H2</span>}
        />
        <Sep />
        <ToolbarButton
          onClick={() => prefix("- ")}
          title="Bulleted list"
          label="•"
        />
        <ToolbarButton
          onClick={() => prefix("1. ")}
          title="Numbered list"
          label="1."
        />
        <ToolbarButton
          onClick={() => prefix("> ")}
          title="Quote"
          label="❝"
        />
        <Sep />
        <ToolbarButton
          onClick={() => wrap("[", "](url)")}
          title="Link"
          label="🔗"
        />

        {templates.length > 0 && (
          <>
            <Sep />
            <select
              defaultValue=""
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) insertTemplate(t);
                e.target.value = "";
              }}
              className="text-xs px-2 py-0.5 border border-ink-200 rounded outline-none focus:border-flame-600 bg-white"
              title="Insert template"
            >
              <option value="">+ template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setMode(mode === "write" ? "preview" : "write")}
          className="text-[11px] text-ink-500 hover:text-ink-900 px-2 py-0.5"
        >
          {mode === "write" ? "Preview" : "Edit"}
        </button>
      </div>

      {mode === "write" ? (
        <textarea
          ref={ref}
          name={name}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => update(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
              e.preventDefault();
              wrap("**");
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
              e.preventDefault();
              wrap("_");
            }
          }}
          className="w-full px-3 py-2.5 text-sm outline-none focus:bg-ink-50/30 transition resize-y"
          style={{ minHeight: `${rows * 1.6}em`, fontFamily: "var(--font-sans)" }}
        />
      ) : (
        <div className="px-4 py-3 text-sm prose-sm prose-soul" style={{ minHeight: `${rows * 1.6}em` }}>
          {value.trim().length > 0 ? (
            <MarkdownRender body={value} />
          ) : (
            <span className="text-ink-400 italic text-xs">Empty.</span>
          )}
        </div>
      )}
    </div>
  );
}

export function MarkdownRender({ body }: { body: string }) {
  return (
    <div className="md-render">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  label,
}: {
  onClick: () => void;
  title: string;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center text-sm text-ink-700 rounded hover:bg-ink-100"
    >
      {label}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-ink-200 mx-0.5" />;
}
