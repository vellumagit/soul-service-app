// Loose date parser for the search palette. Returns a Date when the user's
// query looks like a date, null otherwise. Forgiving on purpose — she
// shouldn't have to remember ISO format to use the jump-to-date affordance.
//
// What it recognizes:
//   - ISO: "2026-05-04", "2026-5-4"
//   - Slash: "5/4", "5/4/26", "5/4/2026", "05/04/2026"     (M/D order)
//   - Month name: "may 4", "may 4 2026", "april 12", "Apr 12"
//   - Just a month: "may", "april" → 1st of that month, current year
//   - Just a day-of-month if reasonable: skipped (too ambiguous)
//
// Year defaults to the CURRENT year when omitted. If the resulting date is
// more than 6 months in the future relative to today AND the user didn't
// supply a year, bump it back to last year — "may 4" in November almost
// always means "this past May," not "next year's May."

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function inferYear(month: number, day: number): number {
  const now = new Date();
  const thisYear = now.getFullYear();
  // Build candidate in this year, then nudge to last year if it lands too
  // far in the future.
  const candidate = new Date(thisYear, month, day);
  const sixMonthsAhead = new Date(now);
  sixMonthsAhead.setMonth(now.getMonth() + 6);
  if (candidate > sixMonthsAhead) return thisYear - 1;
  return thisYear;
}

function normalizeYear(y: number): number {
  // "26" → 2026 if two-digit, else as-is.
  if (y < 100) return 2000 + y;
  return y;
}

function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(year, month, day);
  // Reject overflows (e.g. Feb 30 → Mar 2 means it's not real).
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

export function parseDateQuery(rawQuery: string): Date | null {
  const q = rawQuery.trim().toLowerCase();
  if (!q || q.length > 32) return null;

  // ISO: YYYY-M-D or YYYY-MM-DD
  const isoMatch = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return makeDate(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }

  // Slash: M/D[/Y]
  const slashMatch = q.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    const month = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    const year = y ? normalizeYear(parseInt(y, 10)) : inferYear(month, day);
    return makeDate(year, month, day);
  }

  // Month-name patterns: "may 4", "may 4 2026", "may 4, 2026", "Apr 12"
  // Also just "may" → 1st of May.
  const nameMatch = q.match(/^([a-z]+)(?:\s+(\d{1,2}))?(?:[,\s]+(\d{2,4}))?$/);
  if (nameMatch) {
    const [, name, d, y] = nameMatch;
    const month = MONTHS[name];
    if (month === undefined) return null;
    const day = d ? parseInt(d, 10) : 1;
    const year = y ? normalizeYear(parseInt(y, 10)) : inferYear(month, day);
    return makeDate(year, month, day);
  }

  return null;
}

/** Format a Date for the "Jump to ..." label — short and friendly. */
export function formatDateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** True iff the query LOOKS date-ish enough to offer a "Jump to date..."
 *  fallback when parsing fails — digits or month name fragments. */
export function looksDateIsh(rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q || q.length > 32) return false;
  if (/^\d/.test(q)) return true;
  return Object.keys(MONTHS).some((m) => q.startsWith(m.slice(0, 3)));
}
