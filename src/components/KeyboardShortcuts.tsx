"use client";

// Global keyboard shortcuts.
//
// - Single-letter shortcuts (n, s, r, /) fire immediately
// - `g <letter>` is a two-key sequence for navigation
// - `?` opens an overlay listing every shortcut
//
// Dialog-opening shortcuts (n, s, r) dispatch CustomEvents on window. The
// QuickActions component listens for these and opens the appropriate dialog.
// This avoids prop-drilling state through the AppShell tree.
//
// Shortcuts are suppressed when focus is in an input/textarea/contenteditable
// so typing doesn't trigger them mid-thought.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

const SHORTCUTS = [
  { keys: ["?"], action: "Show this overlay" },
  { keys: ["/"], action: "Search (focus the palette)" },
  { keys: ["n"], action: "New client" },
  { keys: ["s"], action: "Schedule a session" },
  { keys: ["r"], action: "New recurring series" },
  { keys: ["g", "t"], action: "Go to Today" },
  { keys: ["g", "c"], action: "Go to Clients" },
  { keys: ["g", "k"], action: "Go to Calendar" },
  { keys: ["g", "p"], action: "Go to Payments" },
  { keys: ["g", "s"], action: "Go to Settings" },
  { keys: ["g", "?"], action: "Go to Status" },
];

// Re-exported so the AppShell can render a discreet trigger in the footer.
export function KeyboardShortcutsTrigger() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("shortcuts:open-overlay"))
      }
      className="hover:text-ink-700"
      title="Keyboard shortcuts (press ?)"
    >
      Shortcuts
    </button>
  );
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [overlayOpen, setOverlayOpen] = useState(false);
  // The "g" sequence buffer — set to "g" when she presses g, reset after a
  // delay or after the next key.
  const sequenceRef = useRef<string | null>(null);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSequence = useCallback(() => {
    sequenceRef.current = null;
    if (sequenceTimerRef.current) {
      clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Manual-open from the footer link
    function openOverlay() {
      setOverlayOpen(true);
    }
    window.addEventListener("shortcuts:open-overlay", openOverlay);

    function onKeyDown(e: KeyboardEvent) {
      // Skip if the user is typing in an input. We still want to catch ? when
      // typing in something so we can open help, but for navigation shortcuts
      // we always suppress while in inputs.
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Modifier keys (ctrl/meta/alt) → not our shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // ? overlay — allow even in inputs (it's Shift+/)
      if (e.key === "?") {
        e.preventDefault();
        setOverlayOpen(true);
        resetSequence();
        return;
      }

      // Skip everything else while in a text field
      if (inEditable) return;

      // Two-key sequence: g <letter>
      if (sequenceRef.current === "g") {
        const dest: Record<string, string> = {
          t: "/",
          c: "/clients",
          k: "/calendar",
          p: "/payments",
          s: "/settings",
          "?": "/status",
        };
        const href = dest[e.key];
        resetSequence();
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }

      if (e.key === "g") {
        e.preventDefault();
        sequenceRef.current = "g";
        sequenceTimerRef.current = setTimeout(resetSequence, 1200);
        return;
      }

      // Single-key shortcuts
      switch (e.key) {
        case "/":
          e.preventDefault();
          // SearchPalette listens for this and focuses itself
          window.dispatchEvent(new CustomEvent("shortcuts:focus-search"));
          break;
        case "n":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("shortcuts:new-client"));
          break;
        case "s":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("shortcuts:schedule-session"));
          break;
        case "r":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("shortcuts:new-series"));
          break;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("shortcuts:open-overlay", openOverlay);
      resetSequence();
    };
  }, [router, resetSequence]);

  return (
    <Modal
      open={overlayOpen}
      onClose={() => setOverlayOpen(false)}
      title="Keyboard shortcuts"
      size="md"
    >
      <div className="space-y-1">
        {SHORTCUTS.map((s) => (
          <div
            key={s.keys.join("-")}
            className="flex items-center justify-between py-1.5 text-sm"
          >
            <span className="text-ink-700">{s.action}</span>
            <span className="flex items-center gap-1">
              {s.keys.map((k, i) => (
                <kbd key={i} className="kbd">
                  {k === "?" ? "?" : k.toUpperCase()}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-400 mt-4 leading-relaxed">
        Press <kbd className="kbd">?</kbd> anywhere to open this overlay. The{" "}
        <kbd className="kbd">G</kbd> sequences mean &ldquo;press G, then the
        letter&rdquo; (1.2 second window).
      </p>
    </Modal>
  );
}
