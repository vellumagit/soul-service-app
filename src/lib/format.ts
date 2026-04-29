// Tiny formatting helpers used across pages.

export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function moneyExact(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
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

export function shortDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fullDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function shortTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortDateTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return shortDate(d) + " · " + shortTime(d);
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
  flame: "bg-flame-100 text-flame-700",
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
