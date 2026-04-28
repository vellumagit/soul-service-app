// Tiny formatting helpers used across pages.

export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function relativeTime(date: Date | null): string {
  if (!date) return "—";
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
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

export function shortDateTime(date: Date | null): string {
  if (!date) return "—";
  return (
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
  );
}

export function bytes(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const READING_TYPE_LABELS: Record<string, string> = {
  soul_reading: "Soul reading",
  heart_clearing: "Heart clearing",
  ancestral_reading: "Ancestral reading",
  love_alignment: "Love alignment",
  inner_child: "Inner child",
  forgiveness_ritual: "Forgiveness ritual",
  first_reading_intake: "First reading + intake",
  reconnection_call: "Reconnection call",
  cord_cutting: "Cord-cutting ritual",
};

export function readingTypeLabel(type: string): string {
  return READING_TYPE_LABELS[type] ?? type;
}

export function readingTypeTone(type: string): string {
  const map: Record<string, string> = {
    soul_reading: "flame",
    heart_clearing: "green",
    ancestral_reading: "purple",
    love_alignment: "rose",
    inner_child: "blue",
    forgiveness_ritual: "ink",
    first_reading_intake: "amber",
    reconnection_call: "ink",
    cord_cutting: "flame",
  };
  return map[type] ?? "ink";
}

export function avatarToneClass(tone: string | null): string {
  const map: Record<string, string> = {
    flame: "bg-flame-100 text-flame-700",
    green: "bg-green-100 text-green-700",
    rose: "bg-rose-100 text-rose-600",
    blue: "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
    amber: "bg-amber-100 text-amber-700",
    ink: "bg-ink-100 text-ink-700",
  };
  return map[tone ?? "ink"] ?? map.ink;
}

export function flagChip(flag: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    overdue: { label: "OVERDUE", cls: "bg-red-50 text-red-700" },
    intake: { label: "NO INTAKE", cls: "bg-amber-50 text-amber-700" },
    "consent-exp": { label: "CONSENT EXP", cls: "bg-amber-50 text-amber-700" },
    dormant: { label: "DORMANT", cls: "bg-ink-100 text-ink-500" },
  };
  return map[flag] ?? { label: flag.toUpperCase(), cls: "bg-ink-100 text-ink-600" };
}
