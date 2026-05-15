"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchResult = {
  kind: "client" | "session" | "file" | "task";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

const KIND_ICON: Record<string, string> = {
  client: "👤",
  session: "📅",
  file: "📎",
  task: "✓",
};

const KIND_LABEL: Record<string, string> = {
  client: "Client",
  session: "Session",
  file: "File",
  task: "Task",
};

export function SearchPalette() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // Cmd/Ctrl+K toggles
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // `/` shortcut from KeyboardShortcuts → open + focus the palette
  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener("shortcuts:focus-search", openHandler);
    return () =>
      window.removeEventListener("shortcuts:focus-search", openHandler);
  }, []);

  // Open/close native dialog
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Tiny delay so the input renders before focusing
      setTimeout(() => inputRef.current?.focus(), 10);
    }
    if (!open && el.open) {
      el.close();
      setQuery("");
      setResults([]);
      setActiveIdx(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        setResults(data.results ?? []);
        setActiveIdx(0);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[activeIdx];
      if (r) go(r.href);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <>
      {/* Trigger button — shown in TopBar */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 text-xs text-ink-500 px-2.5 py-1.5 rounded-md border border-ink-200 hover:bg-ink-50 transition"
        title="Search (⌘K)"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span>Search</span>
        <span className="kbd">⌘K</span>
      </button>
      {/* Mobile-only trigger icon */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 text-ink-600 hover:text-ink-900"
        title="Search"
        aria-label="Search"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="rounded-lg border border-ink-200 shadow-2xl backdrop:bg-ink-900/40 max-w-xl w-full p-0 mt-[10vh]"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100">
          <svg
            className="w-4 h-4 text-ink-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search clients, sessions, files, tasks…"
            className="flex-1 outline-none text-sm bg-transparent text-ink-900 placeholder:text-ink-400"
          />
          <span className="kbd">esc</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="p-6 text-center text-sm text-ink-400">
              Type at least 2 characters to search.
            </div>
          ) : loading ? (
            <div className="p-6 text-center text-sm text-ink-400">
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-400">
              No matches.
            </div>
          ) : (
            <ul className="p-1.5">
              {results.map((r, i) => (
                <li key={`${r.kind}-${r.id}`}>
                  <button
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => go(r.href)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left ${
                      i === activeIdx ? "bg-ink-100" : "hover:bg-ink-50"
                    }`}
                  >
                    <span className="w-5 text-center text-ink-400 shrink-0">
                      {KIND_ICON[r.kind]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-900 font-medium truncate">
                        {r.title}
                      </div>
                      {r.subtitle && (
                        <div className="text-xs text-ink-500 truncate">
                          {r.subtitle}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-ink-400 uppercase tracking-wider shrink-0">
                      {KIND_LABEL[r.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-4 py-2 border-t border-ink-100 bg-ink-50/40 flex items-center gap-3 text-[10px] text-ink-500">
          <span>
            <span className="kbd">↑↓</span> navigate
          </span>
          <span>
            <span className="kbd">↵</span> open
          </span>
          <span>
            <span className="kbd">esc</span> close
          </span>
        </div>
      </dialog>
    </>
  );
}
