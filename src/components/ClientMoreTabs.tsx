"use client";

// The "More ▾" tab on a client's page. Overview + Sessions lead the row; the
// six reference views (Activity, Reflections, Patterns, Tasks, Files, Intake)
// live in here so they're one click away without crowding the two she opens
// every visit. Styled to match the folder-tabs; when she's currently ON one of
// these, the button shows that view's name and reads as active. A honey dot
// appears when something inside needs her (open tasks).

import Link from "next/link";
import { useRef, useState } from "react";

const MORE_TABS = [
  { key: "activity", label: "Activity", icon: "🕘" },
  { key: "reflections", label: "Reflections", icon: "🪞" },
  { key: "patterns", label: "Patterns", icon: "✦" },
  { key: "tasks", label: "Tasks", icon: "☑" },
  { key: "files", label: "Files", icon: "📎" },
  { key: "intake", label: "Intake notes", icon: "📝" },
] as const;

export function ClientMoreTabs({
  clientId,
  activeTab,
  counts,
}: {
  clientId: string;
  activeTab: string;
  counts?: Partial<Record<string, number>>;
}) {
  const [open, setOpen] = useState(false);
  // Menu is position:fixed and measured off the button, because the folder-tabs
  // row is an overflow-x:auto scroller (which forces overflow-y to auto) — an
  // absolutely-positioned menu inside it would be clipped at the tab row.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const active = MORE_TABS.find((t) => t.key === activeTab) ?? null;
  const hasAttention = (counts?.tasks ?? 0) > 0;

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((o) => !o);
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "end" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        data-active={active ? true : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        className="folder-tab"
      >
        {active ? active.label : "More"}
        <span
          className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
        {!active && hasAttention && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-honey-600 inline-block"
            title="Open tasks"
          />
        )}
      </button>

      {open && pos && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="w-52 bg-white border border-ink-200 rounded-md shadow-lg z-50 py-1"
          >
            {MORE_TABS.map((tItem) => {
              const count = counts?.[tItem.key];
              const isActive = tItem.key === activeTab;
              return (
                <Link
                  key={tItem.key}
                  href={`/clients/${clientId}?tab=${tItem.key}`}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className={`px-3 py-2 text-sm flex items-center gap-2 hover:bg-ink-50 ${
                    isActive
                      ? "bg-ink-50 text-ink-900 font-medium"
                      : "text-ink-700"
                  }`}
                >
                  <span className="text-ink-400" aria-hidden="true">
                    {tItem.icon}
                  </span>
                  <span className="flex-1">{tItem.label}</span>
                  {typeof count === "number" && count > 0 && (
                    <span className="text-[10px] font-mono text-ink-400">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
