// How a lead submission's raw fields read to a person — in the Inbox and in
// the notes written when she accepts someone. Submissions store machine
// shapes (camelCase keys, ISO timestamps); she should see "Preferred time:
// Fri, Nov 27, 3:30 PM MST", not "preferredWindow 2026-11-27T22:30:00.000Z".
//
// Display only: the stored fields are untouched. Client-safe (no server
// imports) because LeadInboxList renders in the browser.

/** Our own field names, spelled the way she'd say them. */
const KNOWN_LABELS: Record<string, string> = {
  message: "Message",
  preferredWindow: "Preferred time",
  spamReasons: "Why it looks like spam",
  phone: "Phone",
  intent: "What they want",
  working_on: "Working on",
  workingOn: "Working on",
  what_brings_you: "What brings them",
  whatBringsYou: "What brings them",
};

/** "preferredWindow" / "what_brings_you" → "Preferred window" / "What brings you". */
export function leadFieldLabel(key: string): string {
  if (KNOWN_LABELS[key]) return KNOWN_LABELS[key];
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** A field value as text: timestamps in HER timezone, lists joined, the
 *  rest as written. */
export function leadFieldValue(value: unknown, timeZone: string): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "string") {
    if (ISO_DATETIME.test(value.trim())) {
      const d = new Date(value.trim());
      if (Number.isFinite(d.getTime())) {
        return d.toLocaleString("en-US", {
          timeZone,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        });
      }
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.join(", ");
  }
  return JSON.stringify(value);
}
