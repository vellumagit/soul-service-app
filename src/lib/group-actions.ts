"use server";

// Server actions for the Groups infrastructure (Phase 1 MVP).
//
// Practitioner-side: create groups, schedule sessions, confirm + mark
// paid the public sign-ups that come in.
// Public-facing: signUpForGroupSession is the only no-auth action;
// everything else gates on requireSession.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gte, isNull, sql, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import {
  accounts,
  groups,
  groupSessions,
  groupAttendees,
  practitionerSettings,
} from "@/db/schema";
import { requireSession } from "./session-cookies";
import { checkRateLimit } from "./rate-limit";
import { getStripe, isStripeConfigured } from "./stripe";
import {
  fulfillCircleSeat,
  refundCircleSeatByPaymentIntent,
} from "./circle-fulfillment";
import { ensureRecurringCircleSessions } from "./recurring-circles";
import { formatSessionLong, resolveTimeZone } from "./timezone";
import { verifyCircleCancelToken } from "./circle-cancel-token";
import {
  isResendConfigured,
  sendCircleRefundRequestedEmail,
  sendCircleCancelledEmail,
  sendCircleRefundEmail,
  asCircleEmailLang,
} from "./resend";

// ─────────────────────────────────────────────────────────────────────
// Practitioner — create / update groups
// ─────────────────────────────────────────────────────────────────────

// Public-action error strings in the CIRCLE's language. These render inside
// the localized signup/checkout/cancel forms — an English error popping up
// mid-Ukrainian flow reads as broken. Errors thrown BEFORE the circle row is
// loaded (rate limit, missing fields) stay English; the browser's required-
// field validation catches most of those first anyway.
const PUB_MSG = {
  unavailable: {
    en: "That session isn't available.",
    uk: "Ця зустріч недоступна.",
  },
  notOpen: {
    en: "That session is no longer open.",
    uk: "Запис на цю зустріч уже закрито.",
  },
  started: {
    en: "That session has already started.",
    uk: "Ця зустріч уже почалася.",
  },
  full: {
    en: "This session is full. Reach out and I'll let you know about the next one.",
    uk: "У цій зустрічі місць уже немає. Напишіть мені — і я повідомлю про наступну.",
  },
  signupsClosed: {
    en: "Sign-ups aren't open online just yet — send a note via the contact form instead.",
    uk: "Онлайн-запис поки не відкрито — напишіть через форму зв'язку.",
  },
  freeCircle: {
    en: "This circle is free — use the regular sign-up below.",
    uk: "Це Коло безкоштовне — скористайтеся звичайною формою запису нижче.",
  },
  alreadyBooked: {
    en: "You're already booked for this circle — check your email for the details.",
    uk: "Ви вже записані в це Коло — деталі у вашій пошті.",
  },
  checkoutFailed: {
    en: "Couldn't start checkout. Try again.",
    uk: "Не вдалося розпочати оплату. Спробуйте ще раз.",
  },
} as const;

function pubMsg(
  key: keyof typeof PUB_MSG,
  lang: "en" | "uk" | null | undefined
): string {
  return PUB_MSG[key][lang === "uk" ? "uk" : "en"];
}

const CIRCLE_CURRENCIES = ["USD", "CAD", "EUR", "GBP"];
function normalizeCurrency(raw: FormDataEntryValue | null): string {
  const c = String(raw ?? "USD").trim().toUpperCase();
  return CIRCLE_CURRENCIES.includes(c) ? c : "USD";
}

/** Whitelist the Circle language — anything unexpected falls back to English
 *  rather than storing junk that downstream filters would choke on. */
function parseCircleLanguage(value: FormDataEntryValue | null): "en" | "uk" {
  return value === "uk" ? "uk" : "en";
}

export async function createGroup(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return;
  const description =
    String(formData.get("description") ?? "").trim().slice(0, 4000) || null;
  const capacity = clampInt(formData.get("defaultCapacity"), 2, 500, 20);
  const duration = clampInt(
    formData.get("defaultDurationMinutes"),
    15,
    480,
    120
  );
  const priceDollars = parseFloat(
    String(formData.get("defaultPrice") ?? "20")
  );
  const priceCents = Number.isFinite(priceDollars)
    ? Math.round(priceDollars * 100)
    : 2000;
  const paymentInstructions =
    String(formData.get("paymentInstructions") ?? "").trim().slice(0, 1000) ||
    null;
  const published = formData.get("published") === "true";
  const currency = normalizeCurrency(formData.get("defaultCurrency"));

  const inserted = await db
    .insert(groups)
    .values({
      accountId,
      name,
      description,
      defaultCapacity: capacity,
      defaultDurationMinutes: duration,
      defaultPriceCents: priceCents,
      defaultCurrency: currency,
      paymentInstructions,
      published,
      language: parseCircleLanguage(formData.get("language")),
    })
    .returning({ id: groups.id });

  revalidatePath("/groups");
  redirect(`/groups/${inserted[0].id}`);
}

/** Edit a circle's defaults. Returns a result (rather than void with silent
 *  `return`s) so EditGroupDialog can close on success and show the reason on
 *  failure instead of just sitting there. */
export async function updateGroup(
  formData: FormData
): Promise<ScheduleGroupSessionResult> {
  const { accountId } = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing circle reference." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return { ok: false, error: "Please give the circle a name." };
  const description =
    String(formData.get("description") ?? "").trim().slice(0, 4000) || null;
  const capacity = clampInt(formData.get("defaultCapacity"), 2, 500, 20);
  const duration = clampInt(
    formData.get("defaultDurationMinutes"),
    15,
    480,
    120
  );
  const priceDollars = parseFloat(
    String(formData.get("defaultPrice") ?? "20")
  );
  const priceCents = Number.isFinite(priceDollars)
    ? Math.round(priceDollars * 100)
    : 2000;
  const paymentInstructions =
    String(formData.get("paymentInstructions") ?? "").trim().slice(0, 1000) ||
    null;
  const published = formData.get("published") === "true";
  const currency = normalizeCurrency(formData.get("defaultCurrency"));

  await db
    .update(groups)
    .set({
      name,
      description,
      defaultCapacity: capacity,
      defaultDurationMinutes: duration,
      defaultPriceCents: priceCents,
      defaultCurrency: currency,
      paymentInstructions,
      published,
      language: parseCircleLanguage(formData.get("language")),
      updatedAt: new Date(),
    })
    .where(and(eq(groups.accountId, accountId), eq(groups.id, id)));

  revalidatePath("/groups");
  revalidatePath(`/groups/${id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function archiveGroup(id: string): Promise<{ ok: true }> {
  const { accountId } = await requireSession();
  await db
    .update(groups)
    .set({ archivedAt: new Date(), published: false })
    .where(and(eq(groups.accountId, accountId), eq(groups.id, id)));
  revalidatePath("/groups");
  return { ok: true };
}

// Turn a group's weekly auto-scheduling on/off + set its day & time. On save we
// immediately populate the next weeks so she sees them right away; the reminders
// cron tops the window up hourly thereafter. See src/lib/recurring-circles.ts.
export async function setGroupRecurrence(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Verify ownership.
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.accountId, accountId), eq(groups.id, id)))
    .limit(1);
  if (!group) return;

  const wantsOn = formData.get("recurrenceEnabled") === "true";
  let weekday: number | null = null;
  let time: string | null = null;
  if (wantsOn) {
    const w = parseInt(String(formData.get("recurrenceWeekday") ?? ""), 10);
    weekday = Number.isInteger(w) && w >= 0 && w <= 6 ? w : null;
    const t = String(formData.get("recurrenceTime") ?? "").trim();
    time = /^\d{1,2}:\d{2}$/.test(t) ? t : null;
  }
  // Only truly "on" if we have a valid day AND time.
  const enabled = wantsOn && weekday != null && time != null;

  await db
    .update(groups)
    .set({
      recurrenceEnabled: enabled,
      recurrenceWeekday: weekday,
      recurrenceTime: time,
      updatedAt: new Date(),
    })
    .where(and(eq(groups.accountId, accountId), eq(groups.id, id)));

  if (enabled) {
    try {
      await ensureRecurringCircleSessions({ groupId: id, accountId });
    } catch (err) {
      console.error("[group] recurrence generation failed", err);
    }
  }

  revalidatePath(`/groups/${id}`);
  revalidatePath("/groups");
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────────────────
// Practitioner — schedule / cancel group sessions
// ─────────────────────────────────────────────────────────────────────

export type ScheduleGroupSessionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Schedule one session under a circle.
 *
 *  Returns a result instead of silently `return`-ing: every guard below used to
 *  bail with a bare `return`, so a rejected submit looked identical to a dead
 *  button — nothing saved, nothing said. The dialog surfaces `error` now. */
export async function scheduleGroupSession(
  formData: FormData
): Promise<ScheduleGroupSessionResult> {
  const { accountId } = await requireSession();
  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return { ok: false, error: "Missing circle reference." };

  // Verify the group belongs to this account.
  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.accountId, accountId), eq(groups.id, groupId)))
    .limit(1);
  if (!group) return { ok: false, error: "That circle no longer exists." };

  // scheduledAt arrives as a tz-aware ISO string from LocalDateTimeInput, so
  // `new Date()` resolves the exact instant she picked. (It used to be a bare
  // "2026-07-26T19:00" from a raw datetime-local input, which the UTC server
  // parsed as 19:00 UTC — landing the circle 6h off in Edmonton.)
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const scheduledAt = new Date(scheduledAtRaw);
  if (!Number.isFinite(scheduledAt.getTime())) {
    return { ok: false, error: "Please pick a valid date and time." };
  }

  const duration = clampInt(
    formData.get("durationMinutes"),
    15,
    480,
    group.defaultDurationMinutes
  );
  const capacity = clampInt(
    formData.get("capacity"),
    2,
    500,
    group.defaultCapacity
  );
  const topic =
    String(formData.get("topic") ?? "").trim().slice(0, 500) || null;
  const meetUrl =
    String(formData.get("meetUrl") ?? "").trim().slice(0, 500) || null;

  const [createdSession] = await db
    .insert(groupSessions)
    .values({
      accountId,
      groupId,
      scheduledAt,
      durationMinutes: duration,
      capacity,
      priceCents: group.defaultPriceCents,
      topic,
      meetUrl,
      status: "scheduled",
    })
    .returning({ id: groupSessions.id });

  // Put it on her Google Calendar with its own Meet link. Best-effort — a
  // Google hiccup must never stop the Circle from being scheduled.
  if (createdSession) {
    try {
      const { syncCircleToGoogle } = await import("./circle-google");
      await syncCircleToGoogle(createdSession.id);
    } catch (err) {
      console.error("[circle] google sync on schedule failed:", err);
    }
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}

export type CancelGroupSessionResult = {
  ok: true;
  /** Attendees who got the cancellation email. */
  notified: number;
  /** Paid seats queued as refund requests in Loose Ends. */
  refundsQueued: number;
};

export async function cancelGroupSession(
  id: string
): Promise<CancelGroupSessionResult> {
  const { accountId } = await requireSession();
  const now = new Date();
  // The status guard makes a double-click idempotent — the second call finds
  // nothing to flip and sends nothing twice.
  const [row] = await db
    .update(groupSessions)
    .set({ status: "cancelled", updatedAt: now })
    .where(
      and(
        eq(groupSessions.accountId, accountId),
        eq(groupSessions.id, id),
        sql`${groupSessions.status} <> 'cancelled'`
      )
    )
    .returning({
      groupId: groupSessions.groupId,
      scheduledAt: groupSessions.scheduledAt,
    });
  let notified = 0;
  let refundsQueued = 0;
  if (row) {
    // Pull the event off her calendar — Google tells the invitees it's off.
    try {
      const { removeCircleFromGoogle } = await import("./circle-google");
      await removeCircleFromGoogle(id);
    } catch (err) {
      console.error("[circle] google delete on cancel failed:", err);
    }

    // Tell the people. Before this, cancelling silently stranded paid guests:
    // no email, no refund, and the Google removal only reached guests whose
    // invite sync had succeeded. Only future sessions — cancelling something
    // already past is bookkeeping, not an event change.
    if (new Date(row.scheduledAt).getTime() > now.getTime()) {
      const [meta] = await db
        .select({ name: groups.name, language: groups.language })
        .from(groups)
        .where(eq(groups.id, row.groupId))
        .limit(1);
      const [settings] = await db
        .select({
          timezone: practitionerSettings.timezone,
          practitionerName: practitionerSettings.practitionerName,
        })
        .from(practitionerSettings)
        .where(eq(practitionerSettings.accountId, accountId))
        .limit(1);
      const attendees = await db
        .select({
          id: groupAttendees.id,
          name: groupAttendees.name,
          email: groupAttendees.email,
          paid: groupAttendees.paid,
          stripePaymentIntentId: groupAttendees.stripePaymentIntentId,
        })
        .from(groupAttendees)
        .where(
          and(
            eq(groupAttendees.groupSessionId, id),
            sql`${groupAttendees.status} <> 'cancelled'`
          )
        );
      const lang = asCircleEmailLang(meta?.language);
      const whenLabel = formatSessionLong(
        new Date(row.scheduledAt),
        resolveTimeZone(settings?.timezone),
        lang === "uk" ? "uk-UA" : "en-US"
      );
      for (const a of attendees) {
        if (a.paid) {
          // Surface in Loose Ends → "Refund requests" for her one-tap
          // approve — card refunds go through Stripe there; manual payments
          // get marked settled once she's returned the money.
          await db
            .update(groupAttendees)
            .set({ refundRequestedAt: now, updatedAt: now })
            .where(
              and(
                eq(groupAttendees.id, a.id),
                isNull(groupAttendees.refundRequestedAt)
              )
            );
          refundsQueued++;
        }
        if (a.email && a.email.includes("@") && isResendConfigured()) {
          try {
            await sendCircleCancelledEmail({
              to: a.email,
              attendeeName: a.name,
              circleName: meta?.name ?? "the Circle",
              whenLabel,
              practitionerName: settings?.practitionerName ?? null,
              wasPaid: a.paid,
              paidViaStripe: a.paid && !!a.stripePaymentIntentId,
              language: lang,
            });
            notified++;
          } catch (err) {
            console.error(
              `[circle] cancellation email failed for attendee ${a.id}:`,
              err
            );
          }
        }
      }
    }

    revalidatePath(`/groups/${row.groupId}`);
    revalidatePath("/calendar");
    revalidatePath("/loose-ends");
    revalidatePath("/");
  }
  return { ok: true, notified, refundsQueued };
}

export type DeleteGroupResult = { ok: true } | { ok: false; error: string };

// Delete a Circle outright. Guarded: a Circle with ANY sign-up history —
// any attendee row on any of its sessions, whatever the status — refuses
// to die, because those rows are payment + relationship records. The
// button exists for its real purpose: removing a Circle created by
// mistake, or a test nobody ever joined. For a retired Circle with
// history, unpublishing (Edit circle) is the right move.
export async function deleteGroup(
  groupId: string
): Promise<DeleteGroupResult> {
  const { accountId } = await requireSession();

  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.accountId, accountId)))
    .limit(1);
  if (!group) return { ok: false, error: "Circle not found." };

  const [{ n }] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(groupAttendees)
    .innerJoin(
      groupSessions,
      eq(groupSessions.id, groupAttendees.groupSessionId)
    )
    .where(eq(groupSessions.groupId, groupId));
  if (n > 0) {
    return {
      ok: false,
      error:
        "This Circle has sign-up history, so it can't be deleted — its records are part of your books. To retire it, open Edit circle and untick “Publish on my storefront” instead.",
    };
  }

  // Pull any Google events for its sessions off her calendar (best-effort —
  // Google being down shouldn't block the delete).
  const sessionRows = await db
    .select({
      id: groupSessions.id,
      googleEventId: groupSessions.googleEventId,
    })
    .from(groupSessions)
    .where(eq(groupSessions.groupId, groupId));
  for (const s of sessionRows) {
    if (!s.googleEventId) continue;
    try {
      const { removeCircleFromGoogle } = await import("./circle-google");
      await removeCircleFromGoogle(s.id);
    } catch (err) {
      console.error("[circle] google delete on circle delete failed:", err);
    }
  }

  await db
    .delete(groups)
    .where(and(eq(groups.id, groupId), eq(groups.accountId, accountId)));

  revalidatePath("/groups");
  revalidatePath("/calendar");
  revalidatePath("/today");
  revalidatePath("/");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Public — sign up for a group session (no auth)
// ─────────────────────────────────────────────────────────────────────

export type SignUpResult =
  | { ok: true; pending: boolean }
  | { ok: false; error: string };

export async function signUpForGroupSession(
  _prev: SignUpResult | undefined,
  formData: FormData
): Promise<SignUpResult> {
  // Honeypot
  const hp = String(formData.get("_hp") ?? "").trim();
  if (hp.length > 0) return { ok: true, pending: true };

  const groupSessionId = String(formData.get("groupSessionId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const emailRaw = String(formData.get("email") ?? "").trim().slice(0, 200);
  const phone =
    String(formData.get("phone") ?? "").trim().slice(0, 50) || null;

  if (!groupSessionId) return { ok: false, error: "Missing session." };
  if (!name) return { ok: false, error: "Please share your name." };
  if (!emailRaw || !emailRaw.includes("@")) {
    return { ok: false, error: "Please share a valid email." };
  }
  const email = emailRaw.toLowerCase();

  // Rate limit — generous; this is a public form
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit("group-signup", ip, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return {
      ok: false,
      error: `Slow down a moment. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  // Verify session exists + published + open + still scheduled. The public
  // page enforces all of this in the UI, but the action must too — a direct
  // POST with a known session id previously slipped past `published` and the
  // circleSignupsOpen master switch entirely.
  const [srow] = await db
    .select({
      session: groupSessions,
      published: groups.published,
      language: groups.language,
      signupsOpen: practitionerSettings.circleSignupsOpen,
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, groupSessions.accountId)
    )
    .where(eq(groupSessions.id, groupSessionId))
    .limit(1);
  const session = srow?.session;
  const lang = srow?.language === "uk" ? ("uk" as const) : ("en" as const);
  if (!session || !srow.published) {
    return { ok: false, error: pubMsg("unavailable", lang) };
  }
  if (!(srow.signupsOpen ?? false)) {
    return { ok: false, error: pubMsg("signupsClosed", lang) };
  }
  if (session.status !== "scheduled") {
    return { ok: false, error: pubMsg("notOpen", lang) };
  }
  if (session.scheduledAt.getTime() < Date.now()) {
    return { ok: false, error: pubMsg("started", lang) };
  }

  // Capacity check
  const countRow = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(groupAttendees)
    .where(
      and(
        eq(groupAttendees.groupSessionId, groupSessionId),
        sql`${groupAttendees.status} <> 'cancelled'`
      )
    );
  const count = countRow[0]?.n ?? 0;
  if (count >= session.capacity) {
    return { ok: false, error: pubMsg("full", lang) };
  }

  // Dedup by email per session — prevent accidental double-signup
  const [existing] = await db
    .select({ id: groupAttendees.id })
    .from(groupAttendees)
    .where(
      and(
        eq(groupAttendees.groupSessionId, groupSessionId),
        sql`LOWER(${groupAttendees.email}) = ${email}`
      )
    )
    .limit(1);
  if (existing) {
    // Treat as success so they see the confirmation — no need to expose
    // "you're already signed up" via timing.
    return { ok: true, pending: true };
  }

  const [inserted] = await db
    .insert(groupAttendees)
    .values({
      accountId: session.accountId,
      groupSessionId,
      name,
      email,
      phone,
      status: "pending",
      paid: false,
      sourceIp: ip === "unknown" ? null : ip,
      userAgent: h.get("user-agent") ?? null,
    })
    .returning({ id: groupAttendees.id });

  // Post-insert capacity re-check — the count above races a concurrent
  // signup (no transaction on the serverless driver), so the LAST writer
  // over capacity backs out. This closes the two-tabs-take-the-last-seat
  // window without a DB constraint.
  const recount = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(groupAttendees)
    .where(
      and(
        eq(groupAttendees.groupSessionId, groupSessionId),
        sql`${groupAttendees.status} <> 'cancelled'`
      )
    );
  if ((recount[0]?.n ?? 0) > session.capacity) {
    await db
      .update(groupAttendees)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(groupAttendees.id, inserted.id));
    return { ok: false, error: pubMsg("full", lang) };
  }

  revalidatePath("/loose-ends");
  revalidatePath("/groups");
  revalidatePath(`/circles/${groupSessionId}`);

  return { ok: true, pending: true };
}

// ─────────────────────────────────────────────────────────────────────
// Public — pay for a seat via Stripe Checkout (no auth)
// ─────────────────────────────────────────────────────────────────────

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function createCircleCheckout(input: {
  groupSessionId: string;
  name: string;
  email: string;
  phone?: string;
  _hp?: string; // honeypot
}): Promise<CheckoutResult> {
  // Honeypot — pretend success-ish without doing anything.
  if ((input._hp ?? "").trim().length > 0) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  if (!isStripeConfigured()) {
    return {
      ok: false,
      error: "Card payment isn't set up yet. Use the other ways to pay below.",
    };
  }

  const groupSessionId = String(input.groupSessionId ?? "");
  const name = String(input.name ?? "").trim().slice(0, 200);
  const emailRaw = String(input.email ?? "").trim().slice(0, 200);
  const phone = String(input.phone ?? "").trim().slice(0, 50) || null;
  if (!groupSessionId) return { ok: false, error: "Missing session." };
  if (!name) return { ok: false, error: "Please share your name." };
  if (!emailRaw || !emailRaw.includes("@")) {
    return { ok: false, error: "Please share a valid email." };
  }
  const email = emailRaw.toLowerCase();

  // Rate limit — generous; public form.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit("circle-checkout", ip, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return {
      ok: false,
      error: `Slow down a moment. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  // Load session + group (price, currency, capacity, name).
  const [row] = await db
    .select({
      sessionId: groupSessions.id,
      accountId: groupSessions.accountId,
      scheduledAt: groupSessions.scheduledAt,
      status: groupSessions.status,
      capacity: groupSessions.capacity,
      priceCents: groupSessions.priceCents,
      groupName: groups.name,
      currency: groups.defaultCurrency,
      published: groups.published,
      language: groups.language,
      // Her connected Stripe account — payments are charged directly on it.
      stripeAccountId: practitionerSettings.stripeAccountId,
      stripeChargesEnabled: practitionerSettings.stripeChargesEnabled,
      timezone: practitionerSettings.timezone,
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, groupSessions.accountId)
    )
    .where(eq(groupSessions.id, groupSessionId))
    .limit(1);
  const lang = row?.language === "uk" ? ("uk" as const) : ("en" as const);
  if (!row || !row.published) {
    return { ok: false, error: pubMsg("unavailable", lang) };
  }
  if (row.status !== "scheduled") {
    return { ok: false, error: pubMsg("notOpen", lang) };
  }
  if (row.scheduledAt.getTime() < Date.now()) {
    return { ok: false, error: pubMsg("started", lang) };
  }
  if (row.priceCents <= 0) {
    return { ok: false, error: pubMsg("freeCircle", lang) };
  }

  // The practitioner must have connected her Stripe account AND finished
  // activation (charges enabled). Until then the storefront shows only the
  // manual (Venmo/cash) lane, so this is a belt-and-suspenders guard.
  if (!row.stripeAccountId || !row.stripeChargesEnabled) {
    return {
      ok: false,
      error: "Card payment isn't set up yet. Use the other ways to pay below.",
    };
  }
  const connectedAccountId = row.stripeAccountId;

  // Capacity check (non-cancelled attendees count, incl. pending-payment holds).
  const countRow = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(groupAttendees)
    .where(
      and(
        eq(groupAttendees.groupSessionId, groupSessionId),
        sql`${groupAttendees.status} <> 'cancelled'`
      )
    );
  if ((countRow[0]?.n ?? 0) >= row.capacity) {
    return { ok: false, error: pubMsg("full", lang) };
  }

  // Already paid with this email? Don't double-charge.
  const [existing] = await db
    .select({ id: groupAttendees.id, paid: groupAttendees.paid })
    .from(groupAttendees)
    .where(
      and(
        eq(groupAttendees.groupSessionId, groupSessionId),
        sql`LOWER(${groupAttendees.email}) = ${email}`,
        eq(groupAttendees.paid, true)
      )
    )
    .limit(1);
  if (existing) {
    return { ok: false, error: pubMsg("alreadyBooked", lang) };
  }

  // A retry (second tab, "did it go through?") previously inserted a SECOND
  // pending hold with its own live Checkout — both payable, double-charging
  // the customer and double-holding seats. Reuse the standing pending row
  // instead, and expire its old Checkout below so only one link can pay.
  const [pendingRow] = await db
    .select({
      id: groupAttendees.id,
      stripeCheckoutSessionId: groupAttendees.stripeCheckoutSessionId,
    })
    .from(groupAttendees)
    .where(
      and(
        eq(groupAttendees.groupSessionId, groupSessionId),
        sql`LOWER(${groupAttendees.email}) = ${email}`,
        eq(groupAttendees.status, "pending"),
        eq(groupAttendees.paid, false)
      )
    )
    .limit(1);

  let attendee: { id: string };
  let createdFresh = false;
  if (pendingRow) {
    attendee = { id: pendingRow.id };
    await db
      .update(groupAttendees)
      .set({ name, phone, updatedAt: new Date() })
      .where(eq(groupAttendees.id, pendingRow.id));
  } else {
    createdFresh = true;
    // Create a pending attendee row that holds the seat through checkout.
    const [freshRow] = await db
      .insert(groupAttendees)
      .values({
        accountId: row.accountId,
        groupSessionId,
        name,
        email,
        phone,
        status: "pending",
        paid: false,
        sourceIp: ip === "unknown" ? null : ip,
        userAgent: h.get("user-agent") ?? null,
      })
      .returning({ id: groupAttendees.id });
    attendee = freshRow;

    // Post-insert capacity re-check — closes the two-simultaneous-checkouts
    // race (no transaction on the serverless driver): the last writer over
    // capacity backs out before any money moves.
    const recount = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(groupAttendees)
      .where(
        and(
          eq(groupAttendees.groupSessionId, groupSessionId),
          sql`${groupAttendees.status} <> 'cancelled'`
        )
      );
    if ((recount[0]?.n ?? 0) > row.capacity) {
      await db
        .update(groupAttendees)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(groupAttendees.id, attendee.id));
      return { ok: false, error: pubMsg("full", lang) };
    }
  }

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`;

  try {
    const stripe = getStripe();

    // If we're reusing a standing hold, kill its old Checkout first so the
    // customer can't end up with two payable links for one seat.
    if (pendingRow?.stripeCheckoutSessionId) {
      try {
        await stripe.checkout.sessions.expire(
          pendingRow.stripeCheckoutSessionId,
          undefined,
          { stripeAccount: connectedAccountId }
        );
      } catch {
        // Already expired/completed — fine either way; the paid=false guard
        // in the webhook keeps a straggler completion idempotent.
      }
    }

    const whenLabel = formatSessionLong(
      row.scheduledAt,
      resolveTimeZone(row.timezone),
      lang === "uk" ? "uk-UA" : "en-US"
    );
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (row.currency ?? "USD").toLowerCase(),
            unit_amount: row.priceCents,
            product_data: { name: `${row.groupName} — ${whenLabel}` },
          },
        },
      ],
      metadata: {
        attendeeId: attendee.id,
        groupSessionId,
        accountId: row.accountId,
        kind: "circle-seat",
      },
      payment_intent_data: {
        metadata: { attendeeId: attendee.id, groupSessionId },
      },
      success_url: `${base}/circles/${groupSessionId}?paid=1`,
      cancel_url: `${base}/circles/${groupSessionId}?canceled=1`,
    },
    // DIRECT charge: create the session ON her connected account, so she's the
    // merchant of record and the money is 100% hers. The resulting
    // checkout.session.completed event fires on her account and is delivered
    // to our Connect webhook (verified with the platform signing secret).
    { stripeAccount: connectedAccountId });

    await db
      .update(groupAttendees)
      .set({ stripeCheckoutSessionId: checkout.id, updatedAt: new Date() })
      .where(eq(groupAttendees.id, attendee.id));

    if (!checkout.url) {
      return { ok: false, error: pubMsg("checkoutFailed", lang) };
    }
    return { ok: true, url: checkout.url };
  } catch (err) {
    // Roll back a freshly-held seat so a failed checkout doesn't leave a
    // ghost. A reused hold keeps its seat — its previous checkout may still
    // be live and the hourly sweep clears it if abandoned.
    if (createdFresh) {
      await db
        .update(groupAttendees)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(groupAttendees.id, attendee.id));
    }
    console.error("[circle] checkout creation failed", err);
    return { ok: false, error: pubMsg("checkoutFailed", lang) };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Practitioner — triage attendees
// ─────────────────────────────────────────────────────────────────────

export async function confirmAttendee(
  attendeeId: string,
  markPaid: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const update: Record<string, unknown> = {
      status: "confirmed",
      updatedAt: new Date(),
    };
    if (markPaid) {
      update.paid = true;
      update.paidAt = new Date();
    }
    const [row] = await db
      .update(groupAttendees)
      .set(update)
      .where(
        and(
          eq(groupAttendees.accountId, accountId),
          eq(groupAttendees.id, attendeeId)
        )
      )
      .returning({ groupSessionId: groupAttendees.groupSessionId });
    if (!row) return { ok: false, error: "Attendee not found" };
    // Fulfillment: send the welcome email (with the meeting link) now that
    // they're confirmed. Idempotent + non-fatal — same path the Stripe
    // webhook uses, so card and manual lanes behave identically.
    try {
      await fulfillCircleSeat(attendeeId);
    } catch (err) {
      console.error("[group] fulfillment after manual confirm failed", err);
    }
    revalidatePath("/loose-ends");
    revalidatePath("/groups");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't confirm",
    };
  }
}

/**
 * Practitioner adds someone to a Circle by hand — the pro-bono / paid-me-another-way
 * door. Without this there is NO way in: the public page only offers card checkout
 * once Stripe is live, so a gifted seat was impossible.
 *
 * Confirms them immediately and runs the same fulfillment as a card purchase
 * (welcome email + meeting link, her heads-up, added to Network), so a comped
 * guest gets exactly the same arrival experience as a paying one.
 */
export async function addCircleAttendee(input: {
  groupSessionId: string;
  name: string;
  email: string;
  /** true = gifted (never charged). false = they paid you some other way. */
  gifted: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const name = String(input.name ?? "").trim().slice(0, 200);
    const emailRaw = String(input.email ?? "").trim().slice(0, 200);
    if (!name) return { ok: false, error: "Please add their name." };
    if (!emailRaw || !emailRaw.includes("@")) {
      return { ok: false, error: "Please add a valid email — it's how they get the link." };
    }
    const email = emailRaw.toLowerCase();

    // Session must be hers, still scheduled, and not already past.
    const [session] = await db
      .select({
        id: groupSessions.id,
        capacity: groupSessions.capacity,
        status: groupSessions.status,
        scheduledAt: groupSessions.scheduledAt,
        groupId: groupSessions.groupId,
      })
      .from(groupSessions)
      .where(
        and(
          eq(groupSessions.accountId, accountId),
          eq(groupSessions.id, input.groupSessionId)
        )
      )
      .limit(1);
    if (!session) return { ok: false, error: "That Circle wasn't found." };
    if (session.status !== "scheduled") {
      return { ok: false, error: "That Circle isn't open." };
    }

    // Don't oversell the room.
    const countRow = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(groupAttendees)
      .where(
        and(
          eq(groupAttendees.groupSessionId, session.id),
          sql`${groupAttendees.status} <> 'cancelled'`
        )
      );
    if ((countRow[0]?.n ?? 0) >= session.capacity) {
      return { ok: false, error: "This Circle is full." };
    }

    // Already on the list? Don't create a duplicate.
    const [existing] = await db
      .select({ id: groupAttendees.id })
      .from(groupAttendees)
      .where(
        and(
          eq(groupAttendees.groupSessionId, session.id),
          sql`LOWER(${groupAttendees.email}) = ${email}`,
          sql`${groupAttendees.status} <> 'cancelled'`
        )
      )
      .limit(1);
    if (existing) {
      return { ok: false, error: "They're already on the list for this Circle." };
    }

    const now = new Date();
    const [created] = await db
      .insert(groupAttendees)
      .values({
        accountId,
        groupSessionId: session.id,
        name,
        email,
        status: "confirmed",
        // Gifted seats are deliberately NOT marked paid, so your numbers stay
        // honest — but they're fully confirmed and get the link.
        paid: !input.gifted,
        paidAt: input.gifted ? null : now,
        paymentMethod: input.gifted ? "gifted" : "manual",
      })
      .returning({ id: groupAttendees.id });

    // Same arrival experience as a paid seat (welcome email + meeting link).
    try {
      await fulfillCircleSeat(created.id);
    } catch (err) {
      console.error("[circle] fulfillment after manual add failed", err);
    }

    revalidatePath(`/groups/${session.groupId}`);
    revalidatePath("/loose-ends");
    revalidatePath("/today");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't add them.",
    };
  }
}

export async function markAttendeeCancelled(
  attendeeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const [row] = await db
      .update(groupAttendees)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(groupAttendees.accountId, accountId),
          eq(groupAttendees.id, attendeeId)
        )
      )
      .returning({ groupSessionId: groupAttendees.groupSessionId });
    // Drop them from the Google invite too — otherwise they keep getting
    // Google's reminders AND can still walk into the Meet unchallenged.
    if (row) {
      try {
        const { syncCircleToGoogle } = await import("./circle-google");
        await syncCircleToGoogle(row.groupSessionId);
      } catch (err) {
        console.error("[circle] google re-sync on attendee cancel failed:", err);
      }
    }
    revalidatePath("/loose-ends");
    revalidatePath("/groups");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't cancel",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Client-initiated refund requests ("Can't make it?" link in Circle emails)
// ─────────────────────────────────────────────────────────────────────

export type RefundRequestResult =
  | { ok: true; state: "requested" | "cancelled" | "already" }
  | { ok: false; error: string };

/** Public — called from the tokenized /circles/cancel/[token] page. The signed
 *  token (not a client-supplied id) is the sole source of attendee identity. */
export async function requestCircleRefund(
  token: string
): Promise<RefundRequestResult> {
  const attendeeId = verifyCircleCancelToken(token);
  if (!attendeeId) {
    return { ok: false, error: "This link isn't valid. Please email me instead." };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit("circle-cancel", ip, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return { ok: false, error: `One moment — try again in ${limit.retryAfterSeconds}s.` };
  }

  const [row] = await db
    .select({
      id: groupAttendees.id,
      accountId: groupAttendees.accountId,
      groupSessionId: groupAttendees.groupSessionId,
      name: groupAttendees.name,
      email: groupAttendees.email,
      paid: groupAttendees.paid,
      status: groupAttendees.status,
      refundedAt: groupAttendees.refundedAt,
      refundRequestedAt: groupAttendees.refundRequestedAt,
      stripePaymentIntentId: groupAttendees.stripePaymentIntentId,
      scheduledAt: groupSessions.scheduledAt,
      groupName: groups.name,
      groupLanguage: groups.language,
    })
    .from(groupAttendees)
    .innerJoin(groupSessions, eq(groupSessions.id, groupAttendees.groupSessionId))
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(eq(groupAttendees.id, attendeeId))
    .limit(1);
  if (!row) return { ok: false, error: "We couldn't find that reservation." };
  const lang = row.groupLanguage === "uk" ? ("uk" as const) : ("en" as const);
  if (row.refundedAt || row.status === "cancelled") {
    return { ok: true, state: "already" };
  }
  if (new Date(row.scheduledAt).getTime() < Date.now()) {
    return {
      ok: false,
      error:
        lang === "uk"
          ? "Це Коло вже відбулося."
          : "This circle has already taken place.",
    };
  }
  if (row.refundRequestedAt) return { ok: true, state: "already" };

  const now = new Date();
  const paidViaStripe = row.paid && !!row.stripePaymentIntentId;

  if (paidViaStripe) {
    // Flag the request; she approves in Loose Ends (one tap → Stripe refund).
    await db
      .update(groupAttendees)
      .set({ refundRequestedAt: now, updatedAt: now })
      .where(
        and(
          eq(groupAttendees.id, attendeeId),
          isNull(groupAttendees.refundRequestedAt)
        )
      );
  } else {
    // No card charge to refund — just release the seat directly, and drop
    // them from the Google invite so reminders stop and the Meet door closes.
    await db
      .update(groupAttendees)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(groupAttendees.id, attendeeId));
    try {
      const { syncCircleToGoogle } = await import("./circle-google");
      await syncCircleToGoogle(row.groupSessionId);
    } catch (err) {
      console.error("[circle] google re-sync on self-cancel failed:", err);
    }
  }

  // Notify the practitioner (best-effort — never fail the client's request).
  try {
    if (isResendConfigured()) {
      const [acct] = await db
        .select({ email: accounts.email })
        .from(accounts)
        .where(eq(accounts.id, row.accountId))
        .limit(1);
      const [pset] = await db
        .select({
          businessEmail: practitionerSettings.businessEmail,
          timezone: practitionerSettings.timezone,
        })
        .from(practitionerSettings)
        .where(eq(practitionerSettings.accountId, row.accountId))
        .limit(1);
      const notifyTo = pset?.businessEmail || acct?.email || null;
      if (notifyTo) {
        await sendCircleRefundRequestedEmail({
          to: notifyTo,
          attendeeName: row.name,
          attendeeEmail: row.email,
          circleName: row.groupName,
          whenLabel: formatSessionLong(
            new Date(row.scheduledAt),
            resolveTimeZone(pset?.timezone)
          ),
          paid: paidViaStripe,
          replyTo: row.email,
        });
      }
    }
  } catch (err) {
    console.error("[circle] refund-request notify failed", err);
  }

  revalidatePath("/loose-ends");
  revalidatePath("/groups");
  return { ok: true, state: paidViaStripe ? "requested" : "cancelled" };
}

/** Practitioner — one-tap approve: issue the Stripe refund on her connected
 *  account. That frees the seat + emails the attendee via the existing refund
 *  pipeline (called directly here too, so it works even if the charge.refunded
 *  webhook isn't enabled). */
export async function approveCircleRefund(
  attendeeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const [row] = await db
      .select({
        id: groupAttendees.id,
        paid: groupAttendees.paid,
        refundedAt: groupAttendees.refundedAt,
        stripePaymentIntentId: groupAttendees.stripePaymentIntentId,
        connectedAccountId: practitionerSettings.stripeAccountId,
      })
      .from(groupAttendees)
      .leftJoin(
        practitionerSettings,
        eq(practitionerSettings.accountId, groupAttendees.accountId)
      )
      .where(
        and(
          eq(groupAttendees.accountId, accountId),
          eq(groupAttendees.id, attendeeId)
        )
      )
      .limit(1);
    if (!row) return { ok: false, error: "Attendee not found." };
    if (row.refundedAt) {
      revalidatePath("/loose-ends");
      return { ok: true }; // already refunded — idempotent
    }
    if (!row.paid) {
      return {
        ok: false,
        error: "No payment on this seat. Use Remove to release it.",
      };
    }
    if (!row.stripePaymentIntentId) {
      // Paid outside Stripe (Venmo / cash / e-transfer): nothing to reverse
      // via the API. Mark it settled + release the seat + tell the attendee —
      // she returns the money out-of-band, the same way it arrived.
      const now = new Date();
      const claimed = await db
        .update(groupAttendees)
        .set({ refundedAt: now, status: "cancelled", updatedAt: now })
        .where(
          and(
            eq(groupAttendees.id, row.id),
            isNull(groupAttendees.refundedAt)
          )
        )
        .returning({ id: groupAttendees.id });
      if (claimed.length > 0) {
        try {
          const [d] = await db
            .select({
              email: groupAttendees.email,
              name: groupAttendees.name,
              scheduledAt: groupSessions.scheduledAt,
              groupName: groups.name,
              groupLanguage: groups.language,
              timezone: practitionerSettings.timezone,
              practitionerName: practitionerSettings.practitionerName,
            })
            .from(groupAttendees)
            .innerJoin(
              groupSessions,
              eq(groupSessions.id, groupAttendees.groupSessionId)
            )
            .innerJoin(groups, eq(groups.id, groupSessions.groupId))
            .leftJoin(
              practitionerSettings,
              eq(practitionerSettings.accountId, groupAttendees.accountId)
            )
            .where(eq(groupAttendees.id, row.id))
            .limit(1);
          if (d?.email && d.email.includes("@") && isResendConfigured()) {
            const lang = asCircleEmailLang(d.groupLanguage);
            await sendCircleRefundEmail({
              to: d.email,
              attendeeName: d.name,
              circleName: d.groupName,
              whenLabel: formatSessionLong(
                new Date(d.scheduledAt),
                resolveTimeZone(d.timezone),
                lang === "uk" ? "uk-UA" : "en-US"
              ),
              practitionerName: d.practitionerName ?? null,
              language: lang,
              manual: true,
            });
          }
        } catch (err) {
          console.error("[circle] manual refund email failed", err);
        }
      }
      revalidatePath("/loose-ends");
      revalidatePath("/groups");
      return { ok: true };
    }
    if (!isStripeConfigured() || !row.connectedAccountId) {
      return {
        ok: false,
        error: "Card payments aren't connected. Refund from Stripe directly.",
      };
    }

    const stripe = getStripe();
    await stripe.refunds.create(
      { payment_intent: row.stripePaymentIntentId },
      { stripeAccount: row.connectedAccountId }
    );

    // Free the seat + email the attendee now (idempotent; doesn't depend on the
    // charge.refunded webhook being enabled).
    try {
      await refundCircleSeatByPaymentIntent(row.stripePaymentIntentId);
    } catch (err) {
      console.error("[circle] post-refund seat release failed", err);
    }

    revalidatePath("/loose-ends");
    revalidatePath("/groups");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't issue the refund.",
    };
  }
}

/** Practitioner — dismiss a refund request without refunding (they're staying). */
export async function dismissCircleRefundRequest(
  attendeeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    await db
      .update(groupAttendees)
      .set({ refundRequestedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(groupAttendees.accountId, accountId),
          eq(groupAttendees.id, attendeeId)
        )
      );
    revalidatePath("/loose-ends");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't update.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function clampInt(
  v: FormDataEntryValue | null,
  min: number,
  max: number,
  def: number
): number {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Re-export for convenience in pages that pull "next upcoming"
export async function listUpcomingPublicGroupSessions(
  limit: number = 4,
  accountId?: string
) {
  const rows = await db
    .select({
      sessionId: groupSessions.id,
      groupId: groupSessions.groupId,
      groupName: groups.name,
      groupDescription: groups.description,
      paymentInstructions: groups.paymentInstructions,
      scheduledAt: groupSessions.scheduledAt,
      durationMinutes: groupSessions.durationMinutes,
      capacity: groupSessions.capacity,
      priceCents: groupSessions.priceCents,
      currency: groups.defaultCurrency,
      topic: groupSessions.topic,
      language: groups.language,
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(
      and(
        eq(groupSessions.status, "scheduled"),
        eq(groups.published, true),
        gte(groupSessions.scheduledAt, new Date()),
        // Scope to the storefront's account so a sandbox/legacy account's
        // published Circles never leak onto svit.live. Omitted → global.
        ...(accountId ? [eq(groups.accountId, accountId)] : [])
      )
    )
    .orderBy(groupSessions.scheduledAt)
    .limit(limit);

  // Attendee counts per session for "X of Y spots taken" display.
  const sessionIds = rows.map((r) => r.sessionId);
  const counts = new Map<string, number>();
  if (sessionIds.length > 0) {
    const countRows = await db
      .select({
        sessionId: groupAttendees.groupSessionId,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(groupAttendees)
      .where(
        and(
          inArray(groupAttendees.groupSessionId, sessionIds),
          sql`${groupAttendees.status} <> 'cancelled'`
        )
      )
      .groupBy(groupAttendees.groupSessionId);
    for (const c of countRows) counts.set(c.sessionId, c.n);
  }

  return rows.map((r) => ({
    ...r,
    scheduledAt: new Date(r.scheduledAt),
    spotsTaken: counts.get(r.sessionId) ?? 0,
  }));
}
