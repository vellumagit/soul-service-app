"use client";

// Carries the practice timezone down to every client component in the
// workspace, so a `"use client"` surface (session cards, the calendar, etc.)
// can render times in HER local zone instead of the viewer's browser zone.
// Seeded once by AppShell from practitionerSettings.timezone. Server components
// don't use this — they pass the resolved tz straight into the format helpers.
//
// The Settings → Timezone control remains the single source of truth: change it
// there and every workspace surface (client + server) follows, because both
// paths read the same practitionerSettings.timezone value.

import { createContext, useContext } from "react";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@/lib/timezone";

const TimeZoneContext = createContext<string>(DEFAULT_TIME_ZONE);

export function TimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone?: string | null;
  children: React.ReactNode;
}) {
  // Resolve here so callers can hand us the raw settings value — an empty,
  // null, or malformed zone falls back to the default instead of throwing
  // inside a leaf's toLocaleString at render time.
  return (
    <TimeZoneContext.Provider value={resolveTimeZone(timeZone)}>
      {children}
    </TimeZoneContext.Provider>
  );
}

/** The practice IANA timezone (e.g. "America/Edmonton"). Falls back to the
 *  default home zone if a provider isn't mounted above (shouldn't happen inside
 *  the workspace, but keeps standalone/previews from crashing). */
export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}
