// Timezone helpers shared by every server-rendered email (reminders +
// booking confirmation). scheduledAt is a true instant; these format it into a
// chosen IANA zone with an explicit zone label so the recipient always sees an
// unambiguous local time — never the server's UTC.
//
// Resolution order is the caller's responsibility via resolveTimeZone():
//   - Client-facing emails: client.timezone → session.timezone → practice tz
//   - Practitioner emails:  session.timezone → practice tz
// Anything unusable falls through to DEFAULT_TIME_ZONE.

// Final fallback for legacy rows created before any zone was captured. Chosen
// as the practice's expected home region; a real practice/session/client zone
// overrides it the moment one is set.
export const DEFAULT_TIME_ZONE = "America/Toronto";

/** A small, friendly picker list for the Settings dropdown. Not exhaustive —
 *  the stored value is a free IANA string, so any zone works; this just covers
 *  the common ones without making her hunt. */
export const COMMON_TIME_ZONES: { id: string; label: string }[] = [
  { id: "America/Vancouver", label: "Pacific — Vancouver / LA" },
  { id: "America/Edmonton", label: "Mountain — Edmonton / Denver" },
  { id: "America/Winnipeg", label: "Central — Winnipeg / Chicago" },
  { id: "America/Toronto", label: "Eastern — Toronto / New York" },
  { id: "America/Halifax", label: "Atlantic — Halifax" },
  { id: "Europe/London", label: "UK — London" },
  { id: "Europe/Kyiv", label: "Ukraine — Kyiv" },
  { id: "Europe/Berlin", label: "Central Europe — Berlin / Warsaw" },
  { id: "Europe/Bucharest", label: "Eastern Europe — Bucharest / Athens" },
];

/** True if `tz` is a usable IANA zone name on this runtime. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== "string") return false;
  try {
    // Throws a RangeError for an unknown time zone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** First valid candidate, else DEFAULT_TIME_ZONE. Pass most-specific first. */
export function resolveTimeZone(
  ...candidates: (string | null | undefined)[]
): string {
  for (const c of candidates) {
    if (isValidTimeZone(c)) return c;
  }
  return DEFAULT_TIME_ZONE;
}

/** "Monday, July 14 at 3:30 PM EDT" — the full labelled line for email bodies. */
export function formatSessionLong(date: Date, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  return date.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** "Mon, Jul 14" — for subject lines. */
export function formatSessionShortDate(date: Date, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  return date.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "3:30 PM EDT" — short time WITH the zone label. */
export function formatSessionShortTime(date: Date, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  return date.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
