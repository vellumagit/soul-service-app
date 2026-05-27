"use client";

// Sets `data-time-of-day` on <html> based on the user's local hour, so the
// app surface tones gently shift across the day. The actual color overrides
// live in globals.css under `html[data-time-of-day=...]` — this component
// is just the dispatcher.
//
// Bands:
//   morning   5–9     cool, fresh
//   midday    9–16    default (no override)
//   dusk     16–20    warm rose
//   night    20–5     warm lamplight
//
// We re-check every 5 minutes so a long-held page crosses band boundaries
// cleanly without forcing a hard refresh.

import { useEffect } from "react";

type Band = "morning" | "midday" | "dusk" | "night";

function bandForHour(h: number): Band {
  if (h >= 5 && h < 9) return "morning";
  if (h >= 9 && h < 16) return "midday";
  if (h >= 16 && h < 20) return "dusk";
  return "night";
}

export function TimeOfDayProvider() {
  useEffect(() => {
    function apply() {
      const band = bandForHour(new Date().getHours());
      // Set on <html> so CSS selectors can target it (body would mean every
      // page-level override has to live inside body, which fights cascade).
      document.documentElement.setAttribute("data-time-of-day", band);
    }
    apply();
    const id = window.setInterval(apply, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}
