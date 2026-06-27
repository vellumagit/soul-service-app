"use server";

// Server actions for the Groups infrastructure (Phase 1 MVP).
//
// Practitioner-side: create groups, schedule sessions, confirm + mark
// paid the public sign-ups that come in.
// Public-facing: signUpForGroupSession is the only no-auth action;
// everything else gates on requireSession.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import {
  groups,
  groupSessions,
  groupAttendees,
} from "@/db/schema";
import { requireSession } from "./session-cookies";
import { checkRateLimit } from "./rate-limit";
import { getStripe, isStripeConfigured } from "./stripe";
import { fulfillCircleSeat } from "./circle-fulfillment";

// ─────────────────────────────────────────────────────────────────────
// Practitioner — create / update groups
// ─────────────────────────────────────────────────────────────────────

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

  const inserted = await db
    .insert(groups)
    .values({
      accountId,
      name,
      description,
      defaultCapacity: capacity,
      defaultDurationMinutes: duration,
      defaultPriceCents: priceCents,
      paymentInstructions,
      published,
    })
    .returning({ id: groups.id });

  revalidatePath("/groups");
  redirect(`/groups/${inserted[0].id}`);
}

export async function updateGroup(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
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

  await db
    .update(groups)
    .set({
      name,
      description,
      defaultCapacity: capacity,
      defaultDurationMinutes: duration,
      defaultPriceCents: priceCents,
      paymentInstructions,
      published,
      updatedAt: new Date(),
    })
    .where(and(eq(groups.accountId, accountId), eq(groups.id, id)));

  revalidatePath("/groups");
  revalidatePath(`/groups/${id}`);
  revalidatePath("/");
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

// ─────────────────────────────────────────────────────────────────────
// Practitioner — schedule / cancel group sessions
// ─────────────────────────────────────────────────────────────────────

export async function scheduleGroupSession(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();
  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return;

  // Verify the group belongs to this account.
  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.accountId, accountId), eq(groups.id, groupId)))
    .limit(1);
  if (!group) return;

  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const scheduledAt = new Date(scheduledAtRaw);
  if (!Number.isFinite(scheduledAt.getTime())) return;

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

  await db.insert(groupSessions).values({
    accountId,
    groupId,
    scheduledAt,
    durationMinutes: duration,
    capacity,
    priceCents: group.defaultPriceCents,
    topic,
    meetUrl,
    status: "scheduled",
  });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function cancelGroupSession(id: string): Promise<{ ok: true }> {
  const { accountId } = await requireSession();
  const [row] = await db
    .update(groupSessions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(eq(groupSessions.accountId, accountId), eq(groupSessions.id, id))
    )
    .returning({ groupId: groupSessions.groupId });
  if (row) {
    revalidatePath(`/groups/${row.groupId}`);
    revalidatePath("/calendar");
    revalidatePath("/");
  }
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

  // Verify session exists + still scheduled + not at capacity
  const [session] = await db
    .select()
    .from(groupSessions)
    .where(eq(groupSessions.id, groupSessionId))
    .limit(1);
  if (!session) {
    return { ok: false, error: "That session isn't available." };
  }
  if (session.status !== "scheduled") {
    return { ok: false, error: "That session is no longer open." };
  }
  if (session.scheduledAt.getTime() < Date.now()) {
    return { ok: false, error: "That session has already started." };
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
    return {
      ok: false,
      error: "This session is full. Reach out and I'll let you know about the next one.",
    };
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

  await db.insert(groupAttendees).values({
    accountId: session.accountId,
    groupSessionId,
    name,
    email,
    phone,
    status: "pending",
    paid: false,
    sourceIp: ip === "unknown" ? null : ip,
    userAgent: h.get("user-agent") ?? null,
  });

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
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(eq(groupSessions.id, groupSessionId))
    .limit(1);
  if (!row || !row.published) {
    return { ok: false, error: "That session isn't available." };
  }
  if (row.status !== "scheduled") {
    return { ok: false, error: "That session is no longer open." };
  }
  if (row.scheduledAt.getTime() < Date.now()) {
    return { ok: false, error: "That session has already started." };
  }
  if (row.priceCents <= 0) {
    return {
      ok: false,
      error: "This circle is free — use the regular sign-up below.",
    };
  }

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
    return {
      ok: false,
      error: "This session is full. Reach out and I'll tell you about the next one.",
    };
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
    return {
      ok: false,
      error: "You're already booked for this circle — check your email for the details.",
    };
  }

  // Create a pending attendee row that holds the seat through checkout.
  const [attendee] = await db
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

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`;

  try {
    const stripe = getStripe();
    const whenLabel = row.scheduledAt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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
    });

    await db
      .update(groupAttendees)
      .set({ stripeCheckoutSessionId: checkout.id, updatedAt: new Date() })
      .where(eq(groupAttendees.id, attendee.id));

    if (!checkout.url) {
      return { ok: false, error: "Couldn't start checkout. Try again." };
    }
    return { ok: true, url: checkout.url };
  } catch (err) {
    // Roll back the held seat so a failed checkout doesn't leave a ghost.
    await db
      .update(groupAttendees)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(groupAttendees.id, attendee.id));
    console.error("[circle] checkout creation failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't start checkout.",
    };
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

export async function markAttendeeCancelled(
  attendeeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    await db
      .update(groupAttendees)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(groupAttendees.accountId, accountId),
          eq(groupAttendees.id, attendeeId)
        )
      );
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
export async function listUpcomingPublicGroupSessions(limit: number = 4) {
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
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(
      and(
        eq(groupSessions.status, "scheduled"),
        eq(groups.published, true),
        gte(groupSessions.scheduledAt, new Date())
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
          sql`${groupAttendees.groupSessionId} = ANY(${sessionIds})`,
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
