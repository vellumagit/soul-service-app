"use client";

import { useState } from "react";
import { NewClientDialog } from "./NewClientDialog";
import { ScheduleSessionDialog } from "./ScheduleSessionDialog";
import { LogPastSessionDialog } from "./LogPastSessionDialog";

type ClientOption = { id: string; fullName: string };

// The "+ New" menu in the top bar. Lets her create whatever from anywhere.
export function QuickActions({ clients }: { clients: ClientOption[] }) {
  const [menuOpen, setMenuOpen] = useState(false);

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
            <NewClientDialog
              trigger={(open) => (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    open();
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-ink-50 flex items-center gap-2"
                >
                  <span className="text-ink-400">👤</span>
                  <span className="flex-1">New client</span>
                </button>
              )}
            />
            <ScheduleSessionDialog
              clients={clients}
              trigger={(open) => (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    open();
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-ink-50 flex items-center gap-2"
                >
                  <span className="text-ink-400">📅</span>
                  <span className="flex-1">Schedule session</span>
                </button>
              )}
            />
            <LogPastSessionDialog
              clients={clients}
              trigger={(open) => (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    open();
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-ink-50 flex items-center gap-2"
                >
                  <span className="text-ink-400">✍️</span>
                  <span className="flex-1">Log a past session</span>
                </button>
              )}
            />
          </div>
        </>
      )}
    </div>
  );
}
