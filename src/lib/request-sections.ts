// The catalogue of everything that can be waiting on /requests.
//
// One place that knows the slug, the name, the blurb and — crucially —
// which group each kind belongs to. The hub renders cards from this, the
// [section] page resolves a slug through it, and the badge counts the
// `waiting` group. Adding a new kind of request means editing this list and
// nothing else.

import type { LooseEnds } from "@/db/queries";

/** `waiting`  — a PERSON is waiting on her. These drive the sidebar count.
 *  `threads`  — her own unfinished work. Real, but nobody is blocked on it,
 *               so it deliberately never touches the badge: a number that
 *               can't reach zero stops being read. */
export type RequestGroup = "waiting" | "threads";

export type RequestSection = {
  slug: string;
  title: string;
  /** One line on the card — what this pile actually is. */
  blurb: string;
  group: RequestGroup;
  /** Pull this section's rows out of a LooseEnds result. */
  count: (e: LooseEnds) => number;
};

export const REQUEST_SECTIONS: RequestSection[] = [
  // ── People waiting on her, most time-sensitive first ────────────────
  {
    slug: "reschedules",
    title: "Reschedule requests",
    blurb: "A client asked to move a session and is waiting on an answer.",
    group: "waiting",
    count: (e) => e.rescheduleRequests.length,
  },
  {
    slug: "sessions",
    title: "Session requests",
    blurb: "Someone asked to book another session, with the times that suit them.",
    group: "waiting",
    count: (e) => e.bookingRequests.length,
  },
  {
    slug: "refunds",
    title: "Refund requests",
    blurb: "A paid Circle attendee asked to cancel. One tap refunds and frees the seat.",
    group: "waiting",
    count: (e) => e.refundRequests.length,
  },
  {
    slug: "circle-signups",
    title: "Circle sign-ups",
    blurb: "People holding a seat on an upcoming Circle, waiting to be confirmed.",
    group: "waiting",
    count: (e) => e.groupSignups.length,
  },

  // ── Her own threads. Nobody is blocked; these are for a quiet moment. ──
  {
    slug: "notetaker",
    title: "Notetaker didn't show",
    blurb: "The bot hit a fatal status. Send a new one, or write the notes by hand.",
    group: "threads",
    count: (e) => e.botFailed.length,
  },
  {
    slug: "closings",
    title: "Waiting for a closing",
    blurb: "Completed sessions where you didn't pause for the three questions.",
    group: "threads",
    count: (e) => e.needReflection.length,
  },
  {
    slug: "notes",
    title: "Notes to write up",
    blurb: "Sessions marked complete but never typed into.",
    group: "threads",
    count: (e) => e.needNotes.length,
  },
  {
    slug: "intentions",
    title: "Intentions to set",
    blurb: "Upcoming sessions with nothing in the intention field yet.",
    group: "threads",
    count: (e) => e.needIntention.length,
  },
  {
    slug: "payments",
    title: "Payments to mark",
    blurb: "Completed sessions not yet marked paid — or gifted.",
    group: "threads",
    count: (e) => e.needPayment.length,
  },
];

export function findRequestSection(slug: string): RequestSection | undefined {
  return REQUEST_SECTIONS.find((s) => s.slug === slug);
}

/** How many people are waiting on her — the number the sidebar shows. */
export function countWaiting(e: LooseEnds): number {
  return REQUEST_SECTIONS.filter((s) => s.group === "waiting").reduce(
    (n, s) => n + s.count(e),
    0
  );
}
