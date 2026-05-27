"use client";

// Sets `data-time-of-day` on <html> based on the user's local hour and
// renders two fixed-position atmosphere layers (a starfield and a
// horizon glow) so CSS can drive sunrise / sunset / night effects
// behind the entire app.
//
// Six bands across the day — finer-grained than the original four so
// the visual transitions feel like genuine moments instead of just a
// shifted palette:
//
//   dawn      5–7    cool blues warming into peach — sunrise at the top
//   morning   7–10   fresh, slightly cool linen
//   midday   10–16   default warm linen, no atmosphere overlay
//   dusk     16–19   golden hour starting — warm sunset glow at the bottom
//   evening  19–22   deeper rose, sun fully down, a hint of stars
//   night    22–5    deepest warm parchment, full starfield, sun gone
//
// We re-check every 5 min so a long-held page crosses band boundaries
// cleanly without forcing a refresh.

import { useEffect } from "react";

type Band = "dawn" | "morning" | "midday" | "dusk" | "evening" | "night";

function bandForHour(h: number): Band {
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 10) return "morning";
  if (h >= 10 && h < 16) return "midday";
  if (h >= 16 && h < 19) return "dusk";
  if (h >= 19 && h < 22) return "evening";
  return "night";
}

export function TimeOfDayProvider() {
  useEffect(() => {
    function apply() {
      const band = bandForHour(new Date().getHours());
      // Set on <html> so the per-band CSS selectors (and the atmosphere
      // layers below) can target it. Body would force every override to
      // live inside body — html is the cleaner root.
      document.documentElement.setAttribute("data-time-of-day", band);
    }
    apply();
    const id = window.setInterval(apply, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  // Two fixed-position layers that sit behind all app content (z-index 0,
  // pointer-events none). Always mounted so transitions can fade them in
  // smoothly when crossing into the relevant band — globals.css drives
  // opacity + which gradient is applied per `[data-time-of-day]` value.
  //
  // aria-hidden because these are pure ambience; nothing for a screen
  // reader to announce.
  return (
    <>
      <div className="atmosphere-starfield" aria-hidden="true" />
      <div className="atmosphere-horizon" aria-hidden="true" />
    </>
  );
}
