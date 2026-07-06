"use client";

import { useRef, useState } from "react";
import { NewClientDialog } from "./NewClientDialog";
import { ScheduleSessionDialog } from "./ScheduleSessionDialog";
import { ScheduleSeriesDialog } from "./ScheduleSeriesDialog";
import { LogPastSessionDialog } from "./LogPastSessionDialog";

type ClientOption = { id: string; fullName: string };

// The "+ New" menu in the top bar. Lets her create whatever from anywhere.
//
// IMPORTANT: the four dialogs are mounted ALWAYS — never inside the
// `{menuOpen && …}` block. An earlier version nested them in the dropdown, so
// clicking a menu item ran `setMenuOpen(false)` (which unmounted the dialog)
// in the same batched render as `open()` — the dialog never appeared. Now each
// dialog is always mounted and registers its `open()` function via the render
// trigger; the menu items call those openers directly, so closing the menu is
// independent of opening the dialog.
//
// The always-mounted copies pass `respondToShortcut={false}` so they don't
// also fire on the global n/s/r keyboard shortcuts (those are handled by the
// page-level dialog instances). This copy is menu-driven only.
export function QuickActions({ clients }: { clients: ClientOption[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openers = useRef<{
    client?: () => void;
    session?: () => void;
    series?: () => void;
    past?: () => void;
  }>({});

  function run(key: keyof typeof openers.current) {
    setMenuOpen(false);
    openers.current[key]?.();
  }

  const itemCls =
    "w-full text-left px-3 py-2 text-sm hover:bg-ink-50 flex items-center gap-2";

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-3 py-2 rounded-md inline-flex items-center gap-1.5"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New
        <svg
          className={`w-3 h-3 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 mt-1 w-56 bg-white border border-ink-200 rounded-md shadow-lg z-50 py-1">
            <button onClick={() => run("client")} className={itemCls}>
              <span className="text-ink-400">👤</span>
              <span className="flex-1">New client</span>
            </button>
            <button onClick={() => run("session")} className={itemCls}>
              <span className="text-ink-400">📅</span>
              <span className="flex-1">Schedule session</span>
            </button>
            <button onClick={() => run("series")} className={itemCls}>
              <span className="text-ink-400">🔁</span>
              <span className="flex-1">New recurring series</span>
            </button>
            <button onClick={() => run("past")} className={itemCls}>
              <span className="text-ink-400">✍️</span>
              <span className="flex-1">Log a past session</span>
            </button>
          </div>
        </>
      )}

      {/* Always-mounted dialogs. Each trigger registers its opener and renders
          nothing visible; the Modal inside shows when its own open state flips. */}
      <NewClientDialog
        respondToShortcut={false}
        trigger={(open) => {
          openers.current.client = open;
          return null;
        }}
      />
      <ScheduleSessionDialog
        clients={clients}
        respondToShortcut={false}
        trigger={(open) => {
          openers.current.session = open;
          return null;
        }}
      />
      <ScheduleSeriesDialog
        clients={clients}
        respondToShortcut={false}
        trigger={(open) => {
          openers.current.series = open;
          return null;
        }}
      />
      <LogPastSessionDialog
        clients={clients}
        trigger={(open) => {
          openers.current.past = open;
          return null;
        }}
      />
    </div>
  );
}
