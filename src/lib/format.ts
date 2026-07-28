// Tiny formatting helpers used across pages.

/** Intl.NumberFormat throws a RangeError on anything that isn't a well-formed
 *  3-letter ISO code — and `practitionerSettings.default_currency` is a free
 *  text field she types into, so a stray "C" or "$" would take down every page
 *  that shows a price, including her client's billing page. Fall back rather
 *  than crash. */
export function safeCurrency(currency: string | null | undefined): string {
  const c = (currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return "USD";
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: c });
    return c;
  } catch {
    return "USD";
  }
}

export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: safeCurrency(currency),
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function moneyExact(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: safeCurrency(currency),
  }).format(cents / 100);
}

export function relativeTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(diffDays) < 1) return "today";
  if (diffDays < 0)
    return Math.abs(diffDays) === 1 ? "1d ago" : `${Math.abs(diffDays)}d ago`;
  return diffDays === 1 ? "tomorrow" : `in ${diffDays}d`;
}

// Every date/time helper below takes an optional `timeZone` (an IANA zone like
// "America/Edmonton"). When supplied, the value is rendered in THAT zone rather
// than the runtime's — which on Vercel server components is UTC, and in the
// browser is the viewer's local zone. Threading the practice timezone through
// these keeps the whole practitioner workspace speaking in her local time no
// matter where it renders or who's logged in. Omit it and behavior is unchanged
// (legacy callers, and client-facing surfaces that intentionally use local tz).
export function shortDate(
  date: Date | string | null,
  timeZone?: string
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function fullDate(date: Date | string | null, timeZone?: string): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function shortTime(
  date: Date | string | null,
  timeZone?: string
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function shortDateTime(
  date: Date | string | null,
  timeZone?: string
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return shortDate(d, timeZone) + " · " + shortTime(d, timeZone);
}

/** Format a DATE-ONLY value ("2026-07-14", from a Postgres `date` column).
 *  These carry no time and no zone. `new Date("2026-07-14")` parses as UTC
 *  midnight, so rendering it through a timezone-aware formatter shifts it to
 *  the previous day for anywhere west of Greenwich — "paid Jul 14" becomes
 *  "paid Jul 13". Format the digits directly instead. */
export function plainDate(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const [, y, mo, d] = m;
  // UTC constructor + UTC timeZone: no conversion happens either way.
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }
  );
}

/** Just the zone abbreviation for an instant — "MDT" / "MST" / "EST" — so a
 *  surface can label its times once ("All times MDT") instead of repeating the
 *  zone on every row. Returns "" when no zone is given. */
export function zoneAbbrev(
  date: Date | string | null,
  timeZone?: string
): string {
  if (!date || !timeZone) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function initials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Deterministic palette pick for a given string (e.g. session type).
// Used by the calendar to color-code different session types automatically.
const TONES = ["flame", "green", "rose", "blue", "purple", "amber"] as const;
export function toneFor(s: string | null | undefined): string {
  if (!s) return "ink";
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

const AVATAR_TONE_CLASSES: Record<string, string> = {
  flame: "bg-plum-100 text-plum-700",
  green: "bg-green-100 text-green-700",
  rose: "bg-rose-100 text-rose-600",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  amber: "bg-amber-100 text-amber-700",
  ink: "bg-ink-100 text-ink-700",
};
export function avatarToneClass(tone: string | null | undefined): string {
  return AVATAR_TONE_CLASSES[tone ?? "ink"] ?? AVATAR_TONE_CLASSES.ink;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  venmo: "Venmo",
  zelle: "Zelle",
  etransfer: "e-Transfer",
  cash: "Cash",
  paypal: "PayPal",
  stripe: "Stripe",
  other: "Other",
};
export function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
