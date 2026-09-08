"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  clients,
  sessions,
  sessionSeries,
  attachments,
  goals,
  tasks,
  communications,
  emailTemplates,
  noteTemplates,
  practitionerSettings,
  importantPeople,
  themes,
  observations,
  leadForms,
  leadSubmissions,
} from "@/db/schema";
import { asc, and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getSettings } from "@/db/queries";
import { requireSession } from "./session-cookies";
import { reportError } from "./observability";
import {
  SERIES_HORIZON_WEEKS,
  occurrenceInstant,
  ruleInstant,
} from "./recurring-sessions";
import { isValidTimeZone, resolveTimeZone } from "./timezone";
import { safeCurrency } from "./format";

// ─────────────────────────────────────────────────────────────────────────────
// Form helpers
// ─────────────────────────────────────────────────────────────────────────────

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(form: FormData, key: string): number | null {
  const v = str(form, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Money from a form field → integer cents, validated. Rejects negatives and
// absurd values, which used to store verbatim and silently corrupt the revenue
// / "unpaid" SUMs on /payments and the client file. Returns null when the field
// is blank/absent (the caller decides what that means).
const MAX_AMOUNT_CENTS = 100_000_000; // $1,000,000 — generous ceiling; blocks fat-finger / tamper
function amountCents(form: FormData, key: string): number | null {
  const v = num(form, key);
  if (v === null) return null;
  if (!(v >= 0)) throw new Error("Amount can't be negative.");
  const cents = Math.round(v * 100);
  if (cents > MAX_AMOUNT_CENTS) {
    throw new Error("That amount looks too large — please double-check it.");
  }
  return cents;
}

// Payment method from a form field, constrained to the DB enum. An out-of-enum
// value used to reach the pgEnum insert and surface as a raw Postgres 500; fold
// anything unrecognized into "other" instead. Null when the field is absent.
const PAYMENT_METHODS = [
  "venmo",
  "zelle",
  "etransfer",
  "cash",
  "paypal",
  "stripe",
  "other",
] as const;
type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];
function paymentMethodValue(
  form: FormData,
  key: string
): PaymentMethodValue | null {
  const v = str(form, key);
  if (v === null) return null;
  return (PAYMENT_METHODS as readonly string[]).includes(v)
    ? (v as PaymentMethodValue)
    : "other";
}

function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

// Locale validator — only accepts our three supported codes.
// Returns null for empty/blank (meaning "follow app language" for clients).
function locale(form: FormData, key: string): "en" | "ru" | "uk" | null {
  const v = str(form, key);
  if (v === "en" || v === "ru" || v === "uk") return v;
  return null;
}

function tagsFromString(input: string | null): string[] {
  if (!input) return [];
  return Array.from(
    new Set(
      input
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );
}

function required<T>(value: T | null, fieldName: string): T {
  if (value === null || value === undefined || value === "")
    throw new Error(`${fieldName} is required`);
  return value as T;
}

// Clamp reminder-hour settings to a sane range (0-168 = 0 hours to one week).
function clampHours(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(168, Math.floor(n)));
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────────────────────────────────────────

export async function createClient(formData: FormData) {
  const { accountId } = await requireSession();
  const fullName = required(str(formData, "fullName"), "Full name");
  const firstSessionDateRaw = str(formData, "firstSessionDate");
  const firstSessionType =
    str(formData, "firstSessionType") ??
    str(formData, "primarySessionType") ??
    "Session";

  const [created] = await db
    .insert(clients)
    .values({
      accountId,
      fullName,
      pronouns: str(formData, "pronouns"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      city: str(formData, "city"),
      timezone: str(formData, "timezone"),
      workingOn: str(formData, "workingOn"),
      aboutClient: str(formData, "aboutClient"),
      intakeNotes: str(formData, "intakeNotes"),
      privateNotes: str(formData, "privateNotes"),
      howTheyFoundMe: str(formData, "howTheyFoundMe"),
      metOn: str(formData, "metOn"),
      metViaClientId: str(formData, "metViaClientId"),
      preferredLanguage: locale(formData, "preferredLanguage"),
      primarySessionType: firstSessionType,
      // Birthday (full ISO date, "YYYY-MM-DD"). Optional. Surfaces on the
      // Today page when month+day match.
      dob: str(formData, "dob"),
      tags: tagsFromString(str(formData, "tags")),
      sensitivities: tagsFromString(str(formData, "sensitivities")),
      emergencyName: str(formData, "emergencyName"),
      emergencyPhone: str(formData, "emergencyPhone"),
      status: "active",
    })
    .returning({ id: clients.id });

  // If a first session date was given, create the session + follow-up tasks.
  if (firstSessionDateRaw) {
    const firstSessionDate = new Date(firstSessionDateRaw + "T12:00:00");
    const isPast = firstSessionDate < new Date();
    const [firstSession] = await db
      .insert(sessions)
      .values({
        accountId,
        clientId: created.id,
        type: firstSessionType,
        status: isPast ? "completed" : "scheduled",
        scheduledAt: firstSessionDate,
        durationMinutes: 60,
      })
      .returning({ id: sessions.id });

    // This used to end here — a bare INSERT and nothing else. A session booked
    // from this dialog got no Google event, no Meet link, no invite, no
    // confirmation email and no notetaker bot, while the very same booking made
    // from the client's profile got all five. The only reason such a session
    // ever reached Google was if she later rescheduled it, because THAT path
    // syncs. Run the same hooks here so where you book it stops mattering.
    // Skipped for a back-dated first session — it already happened, so there's
    // nothing to invite anyone to.
    if (!isPast && firstSession) {
      await runPostScheduleHooks(accountId, firstSession.id, false);
    }

    await scheduleFirstSessionFollowups(
      accountId,
      created.id,
      firstSessionDate,
      fullName
    );
  }

  // Optionally open their portal and send the sign-in link, straight from the
  // new-client dialog. Opt-in per client rather than automatic: ticking it
  // emails a real person the moment she hits Save, and adding someone to the
  // roster isn't always the moment she wants to invite them in.
  if (bool(formData, "openPortal")) {
    try {
      const r = await connectClientPortal(created.id);
      if (!r.ok) {
        console.error("[new client] portal invite failed:", r.error);
      }
    } catch (err) {
      console.error("[new client] portal invite threw:", err);
    }
  }

  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

// Hardcoded touchpoint cadence: 1 week, 1 month, 3 months after the FIRST session.
// Tasks dated in the past are skipped (kept clean for long-time clients being onboarded).
async function scheduleFirstSessionFollowups(
  accountId: string,
  clientId: string,
  firstSessionDate: Date,
  clientName: string
) {
  const FOLLOWUPS = [
    { days: 7, title: "1-week follow-up" },
    { days: 30, title: "1-month follow-up" },
    { days: 90, title: "3-month follow-up" },
  ];

  const now = new Date();
  const rows: typeof tasks.$inferInsert[] = [];

  for (const f of FOLLOWUPS) {
    const dueAt = new Date(firstSessionDate);
    dueAt.setDate(dueAt.getDate() + f.days);
    if (dueAt <= now) continue; // skip past follow-ups
    rows.push({
      accountId,
      title: `${f.title} with ${clientName}`,
      clientId,
      dueAt,
      source: "rule",
    });
  }

  if (rows.length > 0) await db.insert(tasks).values(rows);
}

export async function updateClient(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "Client id");

  await db
    .update(clients)
    .set({
      fullName: required(str(formData, "fullName"), "Full name"),
      pronouns: str(formData, "pronouns"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      city: str(formData, "city"),
      timezone: str(formData, "timezone"),
      workingOn: str(formData, "workingOn"),
      aboutClient: str(formData, "aboutClient"),
      intakeNotes: str(formData, "intakeNotes"),
      privateNotes: str(formData, "privateNotes"),
      howTheyFoundMe: str(formData, "howTheyFoundMe"),
      metOn: str(formData, "metOn"),
      metViaClientId: str(formData, "metViaClientId"),
      preferredLanguage: locale(formData, "preferredLanguage"),
      primarySessionType: str(formData, "primarySessionType"),
      dob: str(formData, "dob"),
      tags: tagsFromString(str(formData, "tags")),
      sensitivities: tagsFromString(str(formData, "sensitivities")),
      emergencyName: str(formData, "emergencyName"),
      emergencyPhone: str(formData, "emergencyPhone"),
      status:
        (str(formData, "status") as
          | "active"
          | "new"
          | "dormant"
          | "archived"
          | null) ?? "active",
      // portalEnabled is deliberately NOT written here. It's owned by the
      // Portal card on the client's profile (connect / disconnect), not by
      // this form. Writing it from a checkbox that no longer exists would
      // send `false` on every profile save and silently cut off a connected
      // client's access.
      updatedAt: new Date(),
    })
    .where(and(eq(clients.accountId, accountId), eq(clients.id, id)));

  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  revalidatePath("/network");
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT PORTAL — send a magic-link invite for a specific client. Reads
// the client row, generates a fresh magic-link, emails it via Resend. The
// client clicks → /portal/sign-in/[token] sets the cookie. We DON'T require
// portalEnabled here; the practitioner may want to send the very first
// invite RIGHT after flipping the toggle on, and from the action's POV
// that's already happened (the toggle is in updateClient above).
// ─────────────────────────────────────────────────────────────────────────────

/** Mark a client booking request as resolved. Drops it out of Loose Ends. */
export async function resolveBookingRequest(
  requestId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const { clientBookingRequests } = await import("@/db/schema");
    const updated = await db
      .update(clientBookingRequests)
      .set({ status: "resolved", reviewedAt: new Date() })
      .where(
        and(
          eq(clientBookingRequests.accountId, accountId),
          eq(clientBookingRequests.id, requestId)
        )
      )
      .returning({ clientId: clientBookingRequests.clientId });
    if (updated.length === 0) {
      return { ok: false, error: "Request not found" };
    }
    revalidatePath("/requests");
    revalidatePath(`/clients/${updated[0].clientId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't resolve request",
    };
  }
}

/** Mark a reschedule request as resolved (regardless of whether she
 *  actually rescheduled the session — she might also just dismiss). Drops
 *  the row out of Loose Ends. */
export async function resolveRescheduleRequest(
  requestId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const { rescheduleRequests } = await import("@/db/schema");
    const updated = await db
      .update(rescheduleRequests)
      .set({
        status: "resolved",
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(rescheduleRequests.accountId, accountId),
          eq(rescheduleRequests.id, requestId)
        )
      )
      .returning({ clientId: rescheduleRequests.clientId });
    if (updated.length === 0) {
      return { ok: false, error: "Request not found" };
    }
    revalidatePath("/requests");
    revalidatePath(`/clients/${updated[0].clientId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't resolve request",
    };
  }
}

export type SendPortalInviteResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string };

export type ReplyToRequestResult =
  | { ok: true; sentTo: string; suppressed: boolean }
  | { ok: false; error: string };

/**
 * Answer a portal request — email the client and mark the request as
 * acknowledged, in one action.
 *
 * The gap this closes: a request could only be "resolved", which meant done.
 * There was no way to say "I've written to them, we're sorting out a time" —
 * so the moment she replied, the request either sat looking untouched or got
 * resolved prematurely and vanished before anything was booked. And the
 * client's portal still read "your practitioner has been notified" with no
 * sign anyone had actually looked.
 *
 * `acknowledged` keeps it on her Requests page and in the sidebar count (it
 * IS still open work), while telling the client someone is on it.
 */
export async function replyToRequest(input: {
  kind: "booking" | "reschedule";
  requestId: string;
  subject: string;
  body: string;
}): Promise<ReplyToRequestResult> {
  try {
    const { accountId } = await requireSession();
    const subject = input.subject.trim().slice(0, 300);
    const body = input.body.trim().slice(0, 8000);
    if (!subject) return { ok: false, error: "Give the email a subject." };
    if (!body) return { ok: false, error: "The message is empty." };

    const { rescheduleRequests, clientBookingRequests } = await import(
      "@/db/schema"
    );
    const table =
      input.kind === "booking" ? clientBookingRequests : rescheduleRequests;

    const [row] = await db
      .select({
        id: table.id,
        clientId: table.clientId,
        clientName: clients.fullName,
        clientEmail: clients.email,
      })
      .from(table)
      .innerJoin(clients, eq(clients.id, table.clientId))
      .where(and(eq(table.accountId, accountId), eq(table.id, input.requestId)))
      .limit(1);
    if (!row) return { ok: false, error: "That request no longer exists." };
    if (!row.clientEmail || !row.clientEmail.includes("@")) {
      return {
        ok: false,
        error:
          "This client has no email on file — add one, or reach them another way.",
      };
    }

    const { isResendConfigured, sendEmail } = await import("./resend");
    if (!isResendConfigured()) {
      return { ok: false, error: "Email isn't configured yet." };
    }
    const settings = await getSettings(accountId);
    const res = await sendEmail({
      to: row.clientEmail,
      subject,
      html: bodyToHtml(body, settings?.businessName ?? null),
      text: body,
      // Reply lands in her inbox, so the thread continues naturally.
      replyTo: settings?.businessEmail ?? undefined,
    });

    // Mark acknowledged, never downgrading something already resolved.
    await db
      .update(table)
      .set({ status: "acknowledged", reviewedAt: new Date() })
      .where(
        and(
          eq(table.accountId, accountId),
          eq(table.id, input.requestId),
          eq(table.status, "pending")
        )
      );

    // Keep it in her communication history with the client.
    try {
      await db.insert(communications).values({
        accountId,
        clientId: row.clientId,
        kind: "email_sent",
        subject,
        body,
        occurredAt: new Date(),
      });
    } catch (err) {
      console.error("[request reply] couldn't log communication:", err);
    }

    revalidatePath("/requests");
    revalidatePath(`/clients/${row.clientId}`);
    revalidatePath("/portal");
    revalidatePath("/portal/book");
    return {
      ok: true,
      sentTo: row.clientEmail,
      suppressed: res.suppressed === true,
    };
  } catch (err) {
    console.error("[request reply] failed:", err);
    return { ok: false, error: "Couldn't send that. Try again." };
  }
}

/**
 * Give a client their own space, in one click.
 *
 * Replaces the old two-step dance (tick a checkbox buried in Edit profile →
 * come back to the overview → find a separate "Send portal invite" link).
 * Turning access on and sending the link are the same intention, so they're
 * the same action now.
 *
 * Enabling FIRST matters: sendPortalInvite refuses a client whose access is
 * off, so the order here is the difference between working and erroring.
 */
export async function connectClientPortal(
  clientId: string
): Promise<SendPortalInviteResult> {
  try {
    const { accountId } = await requireSession();
    const [client] = await db
      .select({ id: clients.id, email: clients.email })
      .from(clients)
      .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)))
      .limit(1);
    if (!client) return { ok: false, error: "Client not found" };
    if (!client.email || !client.email.includes("@")) {
      return {
        ok: false,
        error:
          "This client has no email on file — add one in Edit profile first.",
      };
    }

    await db
      .update(clients)
      .set({ portalEnabled: true, updatedAt: new Date() })
      .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)));

    // Delegate the link + email so there's exactly one implementation of
    // "mint a magic link and send it", including the suppressed-send guard.
    return await sendPortalInvite(clientId);
  } catch (err) {
    console.error("[portal] connect failed:", err);
    return { ok: false, error: "Couldn't turn on portal access." };
  }
}

/**
 * Close a client's space. Flipping the flag is enough on its own —
 * getPortalSession checks it on every request, so a cookie already in a
 * browser stops working immediately — but we also expire their session rows
 * so nothing stale lingers server-side.
 */
export async function disconnectClientPortal(
  clientId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const updated = await db
      .update(clients)
      .set({ portalEnabled: false, updatedAt: new Date() })
      .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)))
      .returning({ id: clients.id });
    if (updated.length === 0) return { ok: false, error: "Client not found" };

    const { clientPortalSessions } = await import("@/db/schema");
    await db
      .update(clientPortalSessions)
      .set({ expiresAt: new Date(0) })
      .where(
        and(
          eq(clientPortalSessions.accountId, accountId),
          eq(clientPortalSessions.clientId, clientId)
        )
      );

    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    console.error("[portal] disconnect failed:", err);
    return { ok: false, error: "Couldn't turn off portal access." };
  }
}

export async function sendPortalInvite(
  clientId: string
): Promise<SendPortalInviteResult> {
  try {
    const { accountId } = await requireSession();
    const rows = await db
      .select({
        id: clients.id,
        fullName: clients.fullName,
        email: clients.email,
        portalEnabled: clients.portalEnabled,
      })
      .from(clients)
      .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)))
      .limit(1);
    const client = rows[0];
    if (!client) return { ok: false, error: "Client not found" };
    if (!client.email || !client.email.includes("@")) {
      return {
        ok: false,
        error: "This client doesn't have an email on file — add one first.",
      };
    }
    if (!client.portalEnabled) {
      return {
        ok: false,
        error: "Turn on portal access for this client first.",
      };
    }

    // Headers gives us the request host so the link works in dev + prod
    // without an env var. Falls back to NEXT_PUBLIC_SITE_URL if set.
    const { headers } = await import("next/headers");
    const h = await headers();
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`;

    const { createMagicLink } = await import("./portal-auth");
    const cleartext = await createMagicLink(accountId, client.id);
    const url = `${base}/portal/sign-in/${cleartext}`;

    const settingsRows = await db
      .select({
        practitionerName: practitionerSettings.practitionerName,
      })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, accountId))
      .limit(1);

    const { sendPortalMagicLinkEmail } = await import("./resend");
    const { suppressed } = await sendPortalMagicLinkEmail({
      to: client.email,
      url,
      clientFirstName: client.fullName.split(" ")[0] ?? null,
      practitionerName: settingsRows[0]?.practitionerName ?? null,
    });

    revalidatePath(`/clients/${clientId}`);
    // EMAIL_RECIPIENT_ALLOWLIST is a staging guard that silently drops mail to
    // anyone not on the list. Reporting ok:true there told her "Invite sent to
    // <client>" when nothing left the building — and she'd wait for a sign-in
    // that could never come. Say what actually happened.
    if (suppressed) {
      return {
        ok: false,
        error: `Nothing was sent — ${client.email} isn't on EMAIL_RECIPIENT_ALLOWLIST, so outgoing mail to them is being blocked. Ask Brian to clear that setting.`,
      };
    }
    return { ok: true, sentTo: client.email };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't send invite",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK — leads / contact-book layer
// ─────────────────────────────────────────────────────────────────────────────

/** Lightweight quick-add for the /network page. Captures the essentials
 *  (name + how she met them) and stamps `is_lead = true`. No first-session
 *  field — that's what triggers auto-promotion later. */
export type AddLeadResult =
  | { ok: true; clientId: string }
  | { ok: false; error: string };

export async function addLead(formData: FormData): Promise<AddLeadResult> {
  try {
    const { accountId } = await requireSession();
    const fullName = required(str(formData, "fullName"), "Full name");

    const [created] = await db
      .insert(clients)
      .values({
        accountId,
        fullName,
        isLead: true,
        howTheyFoundMe: str(formData, "howTheyFoundMe"),
        metOn: str(formData, "metOn"),
        metViaClientId: str(formData, "metViaClientId"),
        email: str(formData, "email"),
        phone: str(formData, "phone"),
        workingOn: str(formData, "workingOn"),
        privateNotes: str(formData, "privateNotes"),
        preferredLanguage: locale(formData, "preferredLanguage"),
        // Leads default to "new" so they sort cleanly if she later switches
        // them to a client without explicitly setting a status.
        status: "new",
      })
      .returning({ id: clients.id });

    revalidatePath("/network");
    revalidatePath("/clients");
    return { ok: true, clientId: created.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't add to network",
    };
  }
}

/** Manual lead/client toggle from the profile. Auto-promotion happens
 *  silently when a session is first scheduled (see scheduleSession),
 *  but she can also demote a client back into the network or promote a
 *  lead without scheduling. */
export type SetLeadStatusResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setClientLeadStatus(
  clientId: string,
  isLead: boolean
): Promise<SetLeadStatusResult> {
  try {
    const { accountId } = await requireSession();
    const updated = await db
      .update(clients)
      .set({ isLead, updatedAt: new Date() })
      .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)))
      .returning({ id: clients.id });
    if (updated.length === 0) {
      return { ok: false, error: "Person not found" };
    }
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clients");
    revalidatePath("/network");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't update",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD CAPTURE — forms management + submission triage
// ─────────────────────────────────────────────────────────────────────────────

/** Create a new lead-magnet form. Returns the cleartext token EXACTLY ONCE
 *  — the practitioner must copy it before navigating away; we store only
 *  the hash. */
export type CreateLeadFormResult =
  | { ok: true; formId: string; token: string; tokenPrefix: string }
  | { ok: false; error: string };

export async function createLeadForm(
  formData: FormData
): Promise<CreateLeadFormResult> {
  try {
    const { accountId } = await requireSession();
    const {
      generateLeadFormToken,
      hashLeadFormToken,
      leadFormTokenPrefix,
      slugifyFormName,
    } = await import("./lead-tokens");

    const name = required(str(formData, "name"), "Form name");
    const defaultIntent = str(formData, "defaultIntent");
    const webhookUrl = str(formData, "webhookUrl");
    const autoAccept = bool(formData, "autoAccept");

    if (webhookUrl) {
      const { validatePublicWebhookUrl } = await import("./url-safety");
      const v = validatePublicWebhookUrl(webhookUrl);
      if (!v.ok) return { ok: false, error: v.error };
    }

    const token = generateLeadFormToken();
    const tokenHash = hashLeadFormToken(token);
    const tokenPrefix = leadFormTokenPrefix(token);
    const slug = slugifyFormName(name);

    const [row] = await db
      .insert(leadForms)
      .values({
        accountId,
        name,
        slug,
        tokenHash,
        tokenPrefix,
        autoAccept,
        defaultIntent,
        webhookUrl,
      })
      .returning({ id: leadForms.id });

    revalidatePath("/network/forms");
    return {
      ok: true,
      formId: row.id,
      token, // cleartext — shown to her, never again
      tokenPrefix,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't create form",
    };
  }
}

/** Rotate a form's token. The old token stops working immediately. New
 *  cleartext returned for one-time display. */
export type RotateLeadFormTokenResult =
  | { ok: true; token: string; tokenPrefix: string }
  | { ok: false; error: string };

export async function rotateLeadFormToken(
  formId: string
): Promise<RotateLeadFormTokenResult> {
  try {
    const { accountId } = await requireSession();
    const {
      generateLeadFormToken,
      hashLeadFormToken,
      leadFormTokenPrefix,
    } = await import("./lead-tokens");

    const token = generateLeadFormToken();
    const updated = await db
      .update(leadForms)
      .set({
        tokenHash: hashLeadFormToken(token),
        tokenPrefix: leadFormTokenPrefix(token),
        updatedAt: new Date(),
      })
      .where(and(eq(leadForms.accountId, accountId), eq(leadForms.id, formId)))
      .returning({ id: leadForms.id });

    if (updated.length === 0) {
      return { ok: false, error: "Form not found" };
    }
    revalidatePath("/network/forms");
    return {
      ok: true,
      token,
      tokenPrefix: leadFormTokenPrefix(token),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Rotate failed",
    };
  }
}

export type LeadFormPatch = {
  name?: string;
  defaultIntent?: string | null;
  webhookUrl?: string | null;
  autoAccept?: boolean;
};

export async function updateLeadForm(
  formId: string,
  patch: LeadFormPatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    if (patch.webhookUrl) {
      const { validatePublicWebhookUrl } = await import("./url-safety");
      const v = validatePublicWebhookUrl(patch.webhookUrl);
      if (!v.ok) return { ok: false, error: v.error };
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof patch.name === "string") updates.name = patch.name;
    if (patch.defaultIntent !== undefined)
      updates.defaultIntent = patch.defaultIntent;
    if (patch.webhookUrl !== undefined) updates.webhookUrl = patch.webhookUrl;
    if (patch.autoAccept !== undefined) updates.autoAccept = patch.autoAccept;
    const updated = await db
      .update(leadForms)
      .set(updates)
      .where(and(eq(leadForms.accountId, accountId), eq(leadForms.id, formId)))
      .returning({ id: leadForms.id });
    if (updated.length === 0) return { ok: false, error: "Form not found" };
    revalidatePath("/network/forms");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Update failed",
    };
  }
}

export async function archiveLeadForm(
  formId: string,
  archived: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const updated = await db
      .update(leadForms)
      .set({
        archivedAt: archived ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(leadForms.accountId, accountId), eq(leadForms.id, formId)))
      .returning({ id: leadForms.id });
    if (updated.length === 0) return { ok: false, error: "Form not found" };
    revalidatePath("/network/forms");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Archive failed",
    };
  }
}

/** Accept a pending submission → create a person (clients row) using the
 *  canonical fields + the form's defaultIntent as howTheyFoundMe (or a custom
 *  intent the practitioner passed).
 *
 *  She picks the LANE at accept time:
 *   - "network" (default) → a contact in her orbit (is_lead = true) — someone
 *     important to her world, not necessarily someone she's working with.
 *   - "client" → someone she's actually working with (is_lead = false).
 *
 *  Accepting NEVER sends a portal invite or any email — portal access is always
 *  a deliberate, separate step (the "Give them their own space" button on a
 *  profile), because a network contact should never be auto-onboarded. */
export type AcceptSubmissionResult =
  | { ok: true; clientId: string; lane: "network" | "client" }
  | { ok: false; error: string };

export async function acceptLeadSubmission(
  submissionId: string,
  options?: { as?: "network" | "client"; sourceOverride?: string }
): Promise<AcceptSubmissionResult> {
  const lane: "network" | "client" = options?.as === "client" ? "client" : "network";
  try {
    const { accountId } = await requireSession();
    const [row] = await db
      .select({
        sub: leadSubmissions,
        form: leadForms,
      })
      .from(leadSubmissions)
      .leftJoin(leadForms, eq(leadSubmissions.formId, leadForms.id))
      .where(
        and(
          eq(leadSubmissions.accountId, accountId),
          eq(leadSubmissions.id, submissionId)
        )
      )
      .limit(1);
    if (!row) return { ok: false, error: "Submission not found" };
    if (row.sub.status !== "pending") {
      return { ok: false, error: `Already ${row.sub.status}` };
    }

    const sub = row.sub;
    const form = row.form;
    const name = (sub.name ?? sub.email ?? "Unnamed lead").trim();
    const source =
      options?.sourceOverride ??
      form?.defaultIntent ??
      (form ? `Form: ${form.name}` : null);

    // Try to fish "workingOn" / intent out of the JSON fields if she didn't
    // already promote with a specific source. Common form field names.
    const fields = (sub.fields ?? {}) as Record<string, unknown>;
    const workingOn =
      pickStringField(fields, [
        "intent",
        "working_on",
        "workingOn",
        "what_brings_you",
        "whatBringsYou",
        "message",
      ]) ?? null;

    // Compose a private-notes preamble from any unmatched form fields, so
    // we don't lose context. Keeps the raw JSON discoverable from the
    // client's overview.
    const matched = new Set([
      "name",
      "email",
      "phone",
      "intent",
      "working_on",
      "workingOn",
      "what_brings_you",
      "whatBringsYou",
      "message",
    ]);
    const dateStr = sub.createdAt.toISOString().slice(0, 10);

    // First-party submissions (our own lead magnets + the compass quiz) carry
    // internal plumbing in `fields` (magnetId, followupsSent, kind…) that would
    // land in her notes as a JSON dump. Give those a clean one-line summary
    // instead; external forms keep the full field context so nothing custom is
    // ever lost.
    let privateNotes: string | null;
    if (fields.kind === "lead-magnet") {
      const title =
        typeof fields.magnetTitle === "string" && fields.magnetTitle.trim()
          ? fields.magnetTitle.trim()
          : "a free resource";
      privateNotes = `Downloaded “${title}” (free resource) on ${dateStr}.`;
    } else if (
      fields.source === "compass-quiz" ||
      typeof fields.quizResultLabel === "string"
    ) {
      const label =
        typeof fields.quizResultLabel === "string" &&
        fields.quizResultLabel.trim()
          ? fields.quizResultLabel.trim()
          : null;
      const base = label
        ? `Took the compass quiz → ${label}`
        : "Took the compass quiz";
      privateNotes = `${base}${
        fields.wantsWorkbook ? " · asked for the workbook" : ""
      } on ${dateStr}.`;
    } else {
      const otherFields = Object.entries(fields).filter(
        ([k]) => !matched.has(k)
      );
      privateNotes =
        otherFields.length > 0
          ? `Submitted via ${form?.name ?? "form"} on ${dateStr}:\n\n` +
            otherFields
              .map(([k, v]) => `- ${k}: ${formatFieldValue(v)}`)
              .join("\n")
          : null;
    }

    // Dedup against existing clients with the same email. Otherwise the
    // same person submitting via two different forms (or the same form on
    // two different days) becomes two duplicate client rows, breaking
    // every "find by email" pattern elsewhere in the app. When we find a
    // match we still link the submission to that client (so the audit
    // trail "this person came from form X" is preserved), and we APPEND
    // the new submission context to private notes instead of clobbering.
    //
    // Case-insensitive match: emails are normalized to lowercase at intake
    // time, so any new submission's email is already lowered. Existing
    // client rows from before the normalization fix may still have mixed
    // case stored, so we compare both sides lowercased here for backward
    // compatibility. (TODO: a one-shot script could re-lowercase existing
    // clients.email + leadSubmissions.email; doing it lazily here is
    // good enough for now.)
    let existingClientId: string | null = null;
    if (sub.email && sub.email.trim().length > 0) {
      const normalizedEmail = sub.email.trim().toLowerCase();
      const [existing] = await db
        .select({ id: clients.id, privateNotes: clients.privateNotes })
        .from(clients)
        .where(
          and(
            eq(clients.accountId, accountId),
            sql`LOWER(${clients.email}) = ${normalizedEmail}`
          )
        )
        .limit(1);
      if (existing) {
        existingClientId = existing.id;
        // Append the new submission's context to whatever's already in
        // private notes — we don't want to lose context but also don't
        // want to overwrite hand-written notes. When she accepts into the
        // CLIENT lane, promote an existing network contact (is_lead → false);
        // the network lane never demotes someone who's already a client.
        const update: Partial<typeof clients.$inferInsert> = {};
        if (privateNotes) {
          update.privateNotes = existing.privateNotes
            ? `${existing.privateNotes}\n\n---\n\n${privateNotes}`
            : privateNotes;
        }
        if (lane === "client") {
          // Promote a network contact into an actual client, and land them on
          // the "Active" tab (not "New") to match a brand-new client-lane accept.
          update.isLead = false;
          update.status = "active";
        }
        if (Object.keys(update).length > 0) {
          await db
            .update(clients)
            .set({ ...update, updatedAt: new Date() })
            .where(
              and(
                eq(clients.accountId, accountId),
                eq(clients.id, existingClientId)
              )
            );
        }
      }
    }

    let clientId: string;
    if (existingClientId) {
      clientId = existingClientId;
    } else {
      const [client] = await db
        .insert(clients)
        .values({
          accountId,
          fullName: name,
          email: sub.email,
          phone: sub.phone,
          isLead: lane === "network",
          howTheyFoundMe: source,
          workingOn,
          privateNotes,
          status: lane === "client" ? "active" : "new",
        })
        .returning({ id: clients.id });
      clientId = client.id;
    }

    await db
      .update(leadSubmissions)
      .set({
        status: "accepted",
        promotedClientId: clientId,
        reviewedAt: new Date(),
        reviewedAction: existingClientId
          ? `accepted → ${lane} (merged into existing person)`
          : `accepted → ${lane}`,
      })
      .where(
        and(
          eq(leadSubmissions.accountId, accountId),
          eq(leadSubmissions.id, submissionId)
        )
      );

    // NOTE: accepting deliberately sends NO email and does NOT touch portal
    // access. Portal onboarding is always a separate, manual step (the "Give
    // them their own space" button on a profile) — a network contact must
    // never be auto-onboarded, and even a new client is invited by hand.

    revalidatePath("/network");
    revalidatePath("/network/inbox");
    revalidatePath("/network/forms");
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, clientId, lane };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Accept failed",
    };
  }
}

export async function rejectLeadSubmission(
  submissionId: string,
  reason: "rejected" | "duplicate" | "spam" = "rejected"
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const status =
      reason === "duplicate"
        ? "duplicate"
        : reason === "spam"
          ? "rejected"
          : "rejected";
    const updated = await db
      .update(leadSubmissions)
      .set({
        status,
        reviewedAt: new Date(),
        reviewedAction: reason,
      })
      .where(
        and(
          eq(leadSubmissions.accountId, accountId),
          eq(leadSubmissions.id, submissionId)
        )
      )
      .returning({ id: leadSubmissions.id });
    if (updated.length === 0) return { ok: false, error: "Submission not found" };
    revalidatePath("/network/inbox");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Reject failed",
    };
  }
}

/** Rescue a submission the spam filter caught: back to pending so it shows in
 *  the inbox and can be accepted normally. The one-click safety valve that
 *  makes auto-quarantine acceptable — a false positive costs a tap, not a
 *  person. */
export async function markLeadSubmissionNotSpam(
  submissionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const updated = await db
      .update(leadSubmissions)
      .set({ status: "pending", reviewedAt: null, reviewedAction: null })
      .where(
        and(
          eq(leadSubmissions.accountId, accountId),
          eq(leadSubmissions.id, submissionId),
          eq(leadSubmissions.status, "spam")
        )
      )
      .returning({ id: leadSubmissions.id });
    if (updated.length === 0)
      return { ok: false, error: "Submission not found (or not spam)" };
    revalidatePath("/network/inbox");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Restore failed",
    };
  }
}

/** Permanently delete a submission. Used to clear out reviewed/rejected
 *  entries from history. Cascades naturally — no related rows. */
export async function deleteLeadSubmission(
  submissionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    await db
      .delete(leadSubmissions)
      .where(
        and(
          eq(leadSubmissions.accountId, accountId),
          eq(leadSubmissions.id, submissionId)
        )
      );
    revalidatePath("/network/inbox");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Delete failed",
    };
  }
}

function pickStringField(
  obj: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Save the Closing Ritual for a session — three optional reflections
 *  she captures right after a session is marked complete. `skip`-mode
 *  passes empty strings; we still stamp closingCompletedAt so the UI
 *  doesn't keep prompting. */
export type SaveClosingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveSessionClosing(
  sessionId: string,
  landed: string,
  remember: string,
  neverForget: string,
  /** Optional milestone label set inside the Closing dialog. If she leaves
   *  it blank we don't touch the existing milestone (whether set or null). */
  milestoneLabel?: string
): Promise<SaveClosingResult> {
  try {
    const { accountId } = await requireSession();
    const trim = (s: string) => {
      const t = s.trim();
      return t.length === 0 ? null : t;
    };
    // Build the patch incrementally so we only touch milestone when the
    // caller explicitly passed something. "" means "clear it"; undefined
    // means "leave whatever's there alone."
    const patch: Record<string, unknown> = {
      closingLanded: trim(landed),
      closingRemember: trim(remember),
      closingNeverForget: trim(neverForget),
      closingCompletedAt: new Date(),
      updatedAt: new Date(),
    };
    if (milestoneLabel !== undefined) {
      const ms = milestoneLabel.trim();
      if (ms.length === 0) {
        patch.milestoneLabel = null;
        patch.milestoneAt = null;
      } else {
        patch.milestoneLabel = ms.slice(0, 80);
        patch.milestoneAt = sql`COALESCE(${sessions.milestoneAt}, NOW())`;
      }
    }
    // Single round-trip: UPDATE + return the clientId, both scoped to the
    // caller's accountId. If 0 rows match (wrong session id, or a session
    // that doesn't belong to this account), `returning()` yields [] and we
    // surface that as an error instead of silently no-op'ing. Previously the
    // follow-up SELECT was unscoped, which meant a wrong-account UUID could
    // trigger a revalidatePath on someone else's client.
    const updated = await db
      .update(sessions)
      .set(patch)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .returning({ clientId: sessions.clientId });

    if (updated.length === 0) {
      return { ok: false, error: "Session not found" };
    }

    // Refresh the surfaces that show closings: client profile (Sessions tab
    // + overview's Recent activity), the calendar, and Today (the closing
    // can show as a small "you reflected on Vlado · 4pm" later).
    revalidatePath(`/clients/${updated[0].clientId}`);
    revalidatePath("/calendar");
    revalidatePath("/today");
    revalidatePath("/practice");

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save closing",
    };
  }
}

/** Pin / unpin / rename a session's milestone label. Passing an empty
 *  string clears the milestone. Idempotent — overwriting is fine. */
export type SetMilestoneResult = { ok: true } | { ok: false; error: string };

export async function setSessionMilestone(
  sessionId: string,
  label: string
): Promise<SetMilestoneResult> {
  try {
    const { accountId } = await requireSession();
    const trimmed = label.trim();
    const labelToWrite = trimmed.length === 0 ? null : trimmed.slice(0, 80);
    // Same pattern as saveSessionClosing — UPDATE with .returning() so we
    // get the clientId back in a single account-scoped round-trip and can
    // fail fast on a wrong-account UUID.
    const updated = await db
      .update(sessions)
      .set({
        milestoneLabel: labelToWrite,
        // Stamp on FIRST mark; on subsequent edits keep the original stamp.
        // We do this with COALESCE so the first save sets it and later saves
        // leave it alone. Clearing the label nulls both.
        milestoneAt:
          labelToWrite === null
            ? null
            : sql`COALESCE(${sessions.milestoneAt}, NOW())`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .returning({ clientId: sessions.clientId });

    if (updated.length === 0) {
      return { ok: false, error: "Session not found" };
    }

    revalidatePath(`/clients/${updated[0].clientId}`);
    revalidatePath("/calendar");
    revalidatePath("/practice");

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't pin milestone",
    };
  }
}

/** Standalone updater for the "Just for you" private-notes block on a
 *  client's overview. We don't want to make her open the full Edit Profile
 *  dialog just to jot a hunch — she should be able to write into the box
 *  she's looking at. Cleared to null if she empties the body. */
export async function updateClientPrivateNotes(
  clientId: string,
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const trimmed = body.trim();
    await db
      .update(clients)
      .set({
        privateNotes: trimmed.length === 0 ? null : body,
        updatedAt: new Date(),
      })
      .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)));
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save private notes",
    };
  }
}

export async function deleteClient(clientId: string) {
  const { accountId } = await requireSession();

  // Before the DB cascade wipes the rows, collect every Blob URL we own so we
  // can delete them too. Otherwise her Vercel Blob storage slowly fills with
  // orphaned avatars, invoice PDFs, and attachments from deleted clients —
  // and the URLs are public, so a copy in someone's chat history would still
  // resolve. "Delete forever" should mean it.
  const blobUrls: string[] = [];
  try {
    const [c] = await db
      .select({ avatarUrl: clients.avatarUrl })
      .from(clients)
      .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)))
      .limit(1);
    if (c?.avatarUrl) blobUrls.push(c.avatarUrl);

    const attachmentRows = await db
      .select({ url: attachments.url })
      .from(attachments)
      .where(
        and(
          eq(attachments.accountId, accountId),
          eq(attachments.clientId, clientId)
        )
      );
    for (const a of attachmentRows) {
      if (a.url) blobUrls.push(a.url);
    }

    const sessionRows = await db
      .select({ invoiceUrl: sessions.invoiceUrl })
      .from(sessions)
      .where(
        and(
          eq(sessions.accountId, accountId),
          eq(sessions.clientId, clientId)
        )
      );
    for (const s of sessionRows) {
      if (s.invoiceUrl) blobUrls.push(s.invoiceUrl);
    }
  } catch (e) {
    console.warn("[deleteClient] couldn't enumerate Blob URLs:", e);
  }

  // Now delete the client — the DB cascade handles every related row.
  await db
    .delete(clients)
    .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)));

  // Best-effort Blob cleanup. Never block or fail the delete on a Blob error.
  if (blobUrls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { del } = await import("@vercel/blob");
      await del(blobUrls);
    } catch (e) {
      console.warn("[deleteClient] Blob delete failed (DB rows already gone):", e);
    }
  }

  revalidatePath("/clients");
  redirect("/clients");
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Result of scheduling a session. `googleWarning` is non-null when the
 *  session was saved but the calendar/Meet push failed — the UI should
 *  surface it as a soft warning rather than a hard error. */
export type ScheduleSessionResult = {
  ok: true;
  sessionId: string;
  googleWarning: string | null;
};

export async function scheduleSession(
  formData: FormData
): Promise<ScheduleSessionResult> {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client");
  const type = str(formData, "type") ?? "Session";
  const scheduledAtRaw = required(str(formData, "scheduledAt"), "Date / time");
  const durationMinutes = num(formData, "durationMinutes") ?? 60;
  const manualMeetUrl = str(formData, "meetUrl");
  // In-person sessions skip Meet generation + the Recall bot; she records in
  // the room with the "Record session" button instead.
  const isInPerson = str(formData, "locationType") === "in_person";
  const locationType = isInPerson ? "in_person" : "online";
  // Zone she booked in, captured from her browser (see ScheduleSessionDialog).
  const tzRaw = str(formData, "timezone");
  const bookingTz = isValidTimeZone(tzRaw) ? tzRaw : null;

  const [created] = await db
    .insert(sessions)
    .values({
      accountId,
      clientId,
      type,
      status: "scheduled",
      scheduledAt: new Date(scheduledAtRaw),
      durationMinutes,
      timezone: bookingTz,
      intention: str(formData, "intention"),
      locationType,
      // No Meet link for in-person; otherwise the pasted fallback (used when
      // Google isn't connected).
      meetUrl: isInPerson ? null : manualMeetUrl,
    })
    .returning({ id: sessions.id });

  // Seed the practice's home timezone from the first booking that carries one,
  // so reminder/confirmation emails have an anchor even before she visits
  // Settings. First-write-wins: only fills it when currently null.
  if (bookingTz) {
    await db
      .update(practitionerSettings)
      .set({ timezone: bookingTz, updatedAt: new Date() })
      .where(
        and(
          eq(practitionerSettings.accountId, accountId),
          isNull(practitionerSettings.timezone)
        )
      );
  }

  // Auto-promote: if this client was in the network (is_lead = true),
  // scheduling their first session moves them into the active client list.
  // Silent — no toast. She'll see them disappear from /network and appear
  // on /clients. Manual override is still available from the profile.
  await db
    .update(clients)
    .set({ isLead: false, updatedAt: new Date() })
    .where(
      and(
        eq(clients.accountId, accountId),
        eq(clients.id, clientId),
        eq(clients.isLead, true)
      )
    );

  const googleWarning = await runPostScheduleHooks(
    accountId,
    created.id,
    isInPerson
  );

  // Booking this session IS the answer to "can I have another session?" —
  // close any open request from this client so she doesn't have to remember
  // to come back and tick it off. Mirrors what rescheduling already does for
  // reschedule requests. Best-effort: bookkeeping must never fail a booking.
  try {
    const { clientBookingRequests } = await import("@/db/schema");
    await db
      .update(clientBookingRequests)
      .set({ status: "resolved", reviewedAt: new Date() })
      .where(
        and(
          eq(clientBookingRequests.accountId, accountId),
          eq(clientBookingRequests.clientId, clientId),
          inArray(clientBookingRequests.status, ["pending", "acknowledged"])
        )
      );
    revalidatePath("/requests");
    revalidatePath("/portal/book");
  } catch (err) {
    console.error("[schedule] couldn't close booking requests:", err);
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/today");
  revalidatePath("/network");

  return { ok: true, sessionId: created.id, googleWarning };
}

/**
 * Everything that has to happen after a session row exists, in the order it
 * has to happen in. Shared by every path that creates a session so none of
 * them can quietly do less than the others — which is exactly what went wrong
 * when the client-creation dialog grew its own inline INSERT.
 *
 * Order matters: Google first (it's what mints the Meet link), then the bot
 * (needs that link on the row), then the confirmation email LAST so it quotes
 * the final link — Google's if the sync worked, her pasted fallback if not.
 *
 * Every step is best-effort. A Calendar outage or a mail hiccup must never
 * undo a booking that's already in the database.
 *
 * Returns a Google warning string to surface in the UI, or null.
 */
async function runPostScheduleHooks(
  accountId: string,
  sessionId: string,
  isInPerson: boolean
): Promise<string | null> {
  // In-person sessions skip Google entirely: there's no Meet to generate and
  // she doesn't want a video link on a session held in a room.
  let googleWarning: string | null = null;
  if (!isInPerson) {
    const sync = await syncSessionToGoogle(sessionId);
    googleWarning = sync.ok === false ? sync.error : null;
  }

  // Short-notice guard: a session booked inside a reminder window would
  // otherwise wait for a cron tick that may come after it starts.
  try {
    const { sendImmediateSessionReminders } = await import("./reminders");
    await sendImmediateSessionReminders(sessionId);
  } catch (err) {
    console.error("[schedule] immediate reminder check failed:", err);
  }

  if (!isInPerson) {
    await maybeAutoAddRecallBot(accountId, sessionId);
  }

  await maybeSendBookingConfirmation(accountId, sessionId);

  return googleWarning;
}

/** Best-effort: if Recall is configured + enabled + auto-add is on +
 *  the session has a Meet URL + the scheduled time is far enough in the
 *  future (>10min, Recall's minimum), schedule a bot. Failures here are
 *  logged but never block session creation. */
async function maybeAutoAddRecallBot(
  accountId: string,
  sessionId: string
): Promise<void> {
  try {
    const { recallConfigured, createBot } = await import("./recall");
    if (!recallConfigured()) return;

    const [settings] = await db
      .select({
        enabled: practitionerSettings.recallEnabled,
        autoAdd: practitionerSettings.recallAutoAdd,
        botName: practitionerSettings.recallBotName,
      })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, accountId))
      .limit(1);
    if (!settings?.enabled || !settings.autoAdd) return;

    const [sess] = await db
      .select({
        scheduledAt: sessions.scheduledAt,
        meetUrl: sessions.meetUrl,
        existingBotId: sessions.recallBotId,
      })
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .limit(1);
    if (!sess || !sess.meetUrl || sess.existingBotId) return;

    const scheduledAt = new Date(sess.scheduledAt);
    const minutesFromNow =
      (scheduledAt.getTime() - Date.now()) / (60 * 1000);
    // Recall requires join_at to be >10 min in the future. We give ourselves
    // a small margin so a session scheduled "right now" still works through
    // the manual "Add bot now" path without hitting their validator.
    if (minutesFromNow <= 11) return;

    const bot = await createBot({
      meetingUrl: sess.meetUrl,
      botName: settings.botName ?? "Notetaker",
      joinAt: scheduledAt.toISOString(),
      metadata: { sessionId, accountId },
    });
    await db
      .update(sessions)
      .set({
        recallBotId: bot.id,
        recallBotStatus: bot.rawStatus ?? "scheduled",
        updatedAt: new Date(),
      })
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      );
  } catch (err) {
    console.warn("[recall auto-add] failed:", err);
    await reportError(err, { where: "recall-auto-add", accountId, sessionId });
  }
}

/** Best-effort: email the client an app-sent "you're booked" confirmation.
 *  Independent of Google Calendar — this is the reliable confirmation. Skips
 *  silently when Resend isn't configured or the client has no email. Never
 *  throws (a mail failure must not fail the booking). */
// ONE email for a whole recurring series — the schedule in plain words, the
// next few dates and where to show up — in the client's preferred language.
// Best-effort: an email hiccup never undoes a saved series.
async function maybeSendSeriesConfirmation(
  accountId: string,
  seriesId: string,
  futureDates: Date[],
  /** updated:true = the series was EDITED — "Updated schedule", and the count
   *  reads as what's remaining rather than the series total. */
  opts: { updated?: boolean } = {}
): Promise<void> {
  try {
    const { isResendConfigured } = await import("./resend");
    if (!isResendConfigured() || futureDates.length === 0) return;
    const [row] = await db
      .select({
        clientName: clients.fullName,
        clientEmail: clients.email,
        clientTimezone: clients.timezone,
        clientLanguage: clients.preferredLanguage,
        sessionType: sessionSeries.type,
        frequency: sessionSeries.frequency,
        durationMinutes: sessionSeries.durationMinutes,
        occurrenceCount: sessionSeries.occurrenceCount,
        locationType: sessionSeries.locationType,
        meetUrl: sessionSeries.meetUrl,
        practitionerName: practitionerSettings.practitionerName,
        businessEmail: practitionerSettings.businessEmail,
        businessAddress: practitionerSettings.businessAddress,
        practiceTimezone: practitionerSettings.timezone,
      })
      .from(sessionSeries)
      .innerJoin(clients, eq(clients.id, sessionSeries.clientId))
      .leftJoin(
        practitionerSettings,
        eq(practitionerSettings.accountId, sessionSeries.accountId)
      )
      .where(
        and(eq(sessionSeries.accountId, accountId), eq(sessionSeries.id, seriesId))
      )
      .limit(1);
    if (!row?.clientEmail) return;
    // The client's own zone if known, else the practice zone.
    const clientZone = resolveTimeZone(row.clientTimezone, row.practiceTimezone);
    const { sendSeriesBookingConfirmationEmail } = await import("./series-email");
    await sendSeriesBookingConfirmationEmail({
      to: row.clientEmail,
      clientName: row.clientName,
      sessionType: row.sessionType,
      frequency: row.frequency,
      durationMinutes: row.durationMinutes,
      dates: futureDates,
      totalCount: opts.updated ? futureDates.length : row.occurrenceCount,
      inPerson: row.locationType === "in_person",
      address: row.businessAddress ?? null,
      meetingUrl: row.meetUrl ?? null,
      practitionerName: row.practitionerName ?? null,
      replyTo: row.businessEmail ?? undefined,
      timeZone: clientZone,
      language: row.clientLanguage === "uk" ? "uk" : "en",
      updated: opts.updated === true,
    });
  } catch (err) {
    console.warn("[series confirmation] failed:", err);
  }
}

async function maybeSendBookingConfirmation(
  accountId: string,
  sessionId: string,
  /** Set when the session was MOVED — same email, different opening line. */
  moved = false
): Promise<void> {
  try {
    const { isResendConfigured, sendSessionBookingConfirmationEmail } =
      await import("./resend");
    if (!isResendConfigured()) return;

    const [row] = await db
      .select({
        clientName: clients.fullName,
        clientEmail: clients.email,
        clientTimezone: clients.timezone,
        scheduledAt: sessions.scheduledAt,
        durationMinutes: sessions.durationMinutes,
        sessionType: sessions.type,
        meetUrl: sessions.meetUrl,
        sessionTimezone: sessions.timezone,
        practitionerName: practitionerSettings.practitionerName,
        businessEmail: practitionerSettings.businessEmail,
        practiceTimezone: practitionerSettings.timezone,
      })
      .from(sessions)
      .innerJoin(clients, eq(clients.id, sessions.clientId))
      .leftJoin(
        practitionerSettings,
        eq(practitionerSettings.accountId, sessions.accountId)
      )
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
      .limit(1);

    if (!row?.clientEmail) return; // can't confirm someone with no address

    // This email goes to the CLIENT → show THEIR local time: their own zone
    // if known, else the zone she booked in, else the practice zone.
    const clientZone = resolveTimeZone(
      row.clientTimezone,
      row.sessionTimezone,
      row.practiceTimezone
    );

    await sendSessionBookingConfirmationEmail({
      to: row.clientEmail,
      clientName: row.clientName,
      sessionType: row.sessionType,
      scheduledAt: new Date(row.scheduledAt),
      durationMinutes: row.durationMinutes,
      meetingUrl: row.meetUrl,
      practitionerName: row.practitionerName ?? null,
      replyTo: row.businessEmail ?? undefined,
      timeZone: clientZone,
      moved,
    });
  } catch (err) {
    console.warn("[booking confirmation] failed:", err);
  }
}

// Add / replace a session's meeting link AFTER it was created (e.g. she made a
// Zoom/Meet room by hand, or Google wasn't connected at schedule time), and
// email the client the link + details. Reuses the booking-confirmation email.
export type SetMeetUrlResult =
  | { ok: true; emailed: boolean }
  | { ok: false; error: string };

export async function setSessionMeetUrl(
  sessionId: string,
  url: string
): Promise<SetMeetUrlResult> {
  const { accountId } = await requireSession();

  const trimmed = (url ?? "").trim();
  if (!trimmed) return { ok: false, error: "Paste a meeting link first." };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "That doesn't look like a link — include the https:// part.",
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "The link must start with https://" };
  }

  const [sess] = await db
    .select({ clientId: sessions.clientId, clientEmail: clients.email })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
    .limit(1);
  if (!sess) return { ok: false, error: "Session not found." };

  await db
    .update(sessions)
    .set({ meetUrl: trimmed, updatedAt: new Date() })
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));

  // Invite the client — best-effort (never fails the save). Only when they
  // have an email on file AND email is configured.
  const { isResendConfigured } = await import("./resend");
  const willEmail = !!sess.clientEmail && isResendConfigured();
  if (willEmail) {
    await maybeSendBookingConfirmation(accountId, sessionId);
  }

  revalidatePath(`/clients/${sess.clientId}`);
  revalidatePath("/today");
  return { ok: true, emailed: willEmail };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECALL — manual + emergency operations
// ─────────────────────────────────────────────────────────────────────────────

/** Emergency "Add bot now" — used when auto-add didn't fire (Recall was
 *  disabled at schedule time, the Meet URL came in late, the meeting was
 *  scheduled outside Soul Service, the bot crashed, etc.). Spawns a bot
 *  to join the Meet immediately (no join_at). */
export type AddBotNowResult =
  | { ok: true; botId: string }
  | { ok: false; error: string };

export async function addBotToSessionNow(
  sessionId: string
): Promise<AddBotNowResult> {
  try {
    const { accountId } = await requireSession();
    const { recallConfigured, createBot } = await import("./recall");
    if (!recallConfigured()) {
      return {
        ok: false,
        error:
          "Recall.ai isn't configured. Set RECALL_API_KEY + RECALL_REGION in your environment.",
      };
    }

    const [sess] = await db
      .select({
        scheduledAt: sessions.scheduledAt,
        meetUrl: sessions.meetUrl,
        existingBotId: sessions.recallBotId,
      })
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .limit(1);
    if (!sess) return { ok: false, error: "Session not found" };
    if (!sess.meetUrl) {
      return {
        ok: false,
        error:
          "This session doesn't have a Meet URL yet. Schedule it through Google Calendar first.",
      };
    }
    if (sess.existingBotId) {
      return {
        ok: false,
        error:
          "A bot is already attached to this session. Cancel it from the dashboard if you want to spawn a fresh one.",
      };
    }

    const [settings] = await db
      .select({ botName: practitionerSettings.recallBotName })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, accountId))
      .limit(1);

    const bot = await createBot({
      meetingUrl: sess.meetUrl,
      botName: settings?.botName ?? "Notetaker",
      // No joinAt → bot joins immediately.
      metadata: { sessionId, accountId, source: "manual" },
    });
    await db
      .update(sessions)
      .set({
        recallBotId: bot.id,
        recallBotStatus: bot.rawStatus ?? "joining_call",
        updatedAt: new Date(),
      })
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      );

    const [s] = await db
      .select({ clientId: sessions.clientId })
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .limit(1);
    if (s) revalidatePath(`/clients/${s.clientId}`);

    return { ok: true, botId: bot.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to add bot",
    };
  }
}

/** Cancel the Recall bot attached to a session. Used internally when a
 *  session is cancelled or rescheduled, and exposed as a manual action so
 *  she can call off a bot that's about to join unwantedly. */
export type CancelBotResult = { ok: true } | { ok: false; error: string };

/** Flip ONE session between online and in person — e.g. an occurrence of a
 *  recurring series that happens in the room this week. Same rules as booking:
 *  in person = no Meet, no notetaker bot (she records with "Record session");
 *  online = Meet link + bot eligibility back on. The rest of a series, and its
 *  single Google event, are untouched. */
export async function setSessionLocation(
  sessionId: string,
  clientId: string,
  locationType: "online" | "in_person"
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const [sess] = await db
      .select({
        current: sessions.locationType,
        botId: sessions.recallBotId,
        botStatus: sessions.recallBotStatus,
        meetUrl: sessions.meetUrl,
        seriesId: sessions.seriesId,
      })
      .from(sessions)
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
      .limit(1);
    if (!sess) return { ok: false, error: "Session not found." };
    if (sess.current === locationType) return { ok: true };

    if (locationType === "in_person") {
      // Call off a bot that's already been sent, and mark the row so the
      // just-in-time sweep never sends one ("cancelled" = she called it off).
      if (sess.botId) {
        try {
          const { cancelBot } = await import("./recall");
          await cancelBot(sess.botId);
        } catch (err) {
          console.warn("[setSessionLocation] bot cancel failed:", err);
        }
      }
      await db
        .update(sessions)
        .set({
          locationType,
          recallBotId: null,
          recallBotStatus: "cancelled",
          updatedAt: new Date(),
        })
        .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));
    } else {
      // Back online: restore the series' shared Meet link if this row has none,
      // and clear the "called off" marker so auto-add can queue a bot again.
      let meetUrl = sess.meetUrl;
      if (!meetUrl && sess.seriesId) {
        const [s] = await db
          .select({ meetUrl: sessionSeries.meetUrl })
          .from(sessionSeries)
          .where(eq(sessionSeries.id, sess.seriesId))
          .limit(1);
        meetUrl = s?.meetUrl ?? null;
      }
      await db
        .update(sessions)
        .set({
          locationType,
          meetUrl,
          recallBotStatus: sess.botStatus === "cancelled" ? null : sess.botStatus,
          updatedAt: new Date(),
        })
        .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));
    }

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/calendar");
    revalidatePath("/today");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't change the location.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The session card's reverse gear: restore, no-show, fix a held session's date
// ─────────────────────────────────────────────────────────────────────────────

/** Put a cancelled / no-show session back on the calendar as scheduled — or
 *  reopen one marked complete by mistake. Upcoming + online: the Google entry
 *  comes back (a series occurrence is un-cancelled on the shared event; a
 *  standalone gets a fresh event) and the client can be told it's back on.
 *  Past sessions: just the status flips — nothing to put on a calendar. */
export async function restoreSession(
  sessionId: string,
  clientId: string,
  opts: { notifyClient?: boolean } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const [row] = await db
      .select({
        status: sessions.status,
        scheduledAt: sessions.scheduledAt,
        seriesId: sessions.seriesId,
        locationType: sessions.locationType,
        googleEventId: sessions.googleEventId,
        googleRecurringEventId: sessions.googleRecurringEventId,
      })
      .from(sessions)
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
      .limit(1);
    if (!row) return { ok: false, error: "Session not found." };
    if (row.status === "scheduled") return { ok: true };

    const now = new Date();
    const upcoming = new Date(row.scheduledAt).getTime() > now.getTime();
    const inPerson = row.locationType === "in_person";
    const notify = opts.notifyClient !== false;

    await db
      .update(sessions)
      .set({
        status: "scheduled",
        recallBotId: null,
        // In person never gets a bot; online is eligible again for auto-add.
        recallBotStatus: inPerson ? "cancelled" : null,
        updatedAt: now,
      })
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));

    if (upcoming && !inPerson) {
      try {
        let reattached = false;
        if (row.seriesId) {
          const [s] = await db
            .select({
              gid: sessionSeries.googleRecurringEventId,
              meetUrl: sessionSeries.meetUrl,
            })
            .from(sessionSeries)
            .where(eq(sessionSeries.id, row.seriesId))
            .limit(1);
          if (s?.gid) {
            const { patchRecurringInstance } = await import("./google-calendar");
            const ok = await patchRecurringInstance(
              accountId,
              s.gid,
              new Date(row.scheduledAt).getTime(),
              { status: "confirmed" },
              { notify: false }
            );
            if (ok) {
              reattached = true;
              await db
                .update(sessions)
                .set({ googleRecurringEventId: s.gid, meetUrl: s.meetUrl, updatedAt: new Date() })
                .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));
            }
          }
        }
        if (!reattached && !row.googleEventId) {
          // Standalone (or the series has no Google event): a fresh event.
          await syncSessionToGoogle(sessionId, { notify });
        }
      } catch (err) {
        console.warn("[restoreSession] Google restore failed:", err);
      }
      if (notify) await maybeSendBookingConfirmation(accountId, sessionId);
    }

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/calendar");
    revalidatePath("/today");
    revalidatePath("/payments");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't restore the session.",
    };
  }
}

/** The client didn't turn up. Keeps the row (and its payment tracking — a
 *  no-show may be billable) and calls off any notetaker bot. */
export async function markNoShow(
  sessionId: string,
  clientId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const [row] = await db
      .select({ status: sessions.status, botId: sessions.recallBotId })
      .from(sessions)
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
      .limit(1);
    if (!row) return { ok: false, error: "Session not found." };
    if (row.botId) {
      try {
        const { cancelBot } = await import("./recall");
        await cancelBot(row.botId);
      } catch (err) {
        console.warn("[markNoShow] bot cancel failed:", err);
      }
    }
    await db
      .update(sessions)
      .set({
        status: "no_show",
        recallBotId: null,
        recallBotStatus: null,
        updatedAt: new Date(),
      })
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/calendar");
    revalidatePath("/today");
    revalidatePath("/payments");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't mark the no-show.",
    };
  }
}

/** Correct the recorded date/time (and length) of a session that already
 *  happened — a typo in "Log a past session", or a completed / no-show /
 *  cancelled row. Purely a record fix: no client email, no bot, and the
 *  Google entry (if any) is moved silently. Upcoming sessions use Reschedule. */
export async function correctSessionDate(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const id = required(str(formData, "id"), "Session id");
    const clientId = required(str(formData, "clientId"), "Client id");
    const newAt = new Date(required(str(formData, "scheduledAt"), "Date / time"));
    if (Number.isNaN(newAt.getTime())) {
      return { ok: false, error: "Couldn't read that date and time." };
    }
    const durationRaw = num(formData, "durationMinutes");
    const [row] = await db
      .select({
        status: sessions.status,
        scheduledAt: sessions.scheduledAt,
        durationMinutes: sessions.durationMinutes,
        googleEventId: sessions.googleEventId,
        googleRecurringEventId: sessions.googleRecurringEventId,
      })
      .from(sessions)
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)))
      .limit(1);
    if (!row) return { ok: false, error: "Session not found." };
    if (row.status === "scheduled") {
      return {
        ok: false,
        error: "This session is still upcoming — use Reschedule for it.",
      };
    }
    const durationMinutes =
      durationRaw != null ? Math.max(5, Math.min(180, durationRaw)) : row.durationMinutes;

    await db
      .update(sessions)
      .set({ scheduledAt: newAt, durationMinutes, updatedAt: new Date() })
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)));

    // Move the calendar entry to match — silently; it's a record correction.
    try {
      const g = await import("./google-calendar");
      if (row.googleRecurringEventId) {
        await g.patchRecurringInstance(
          accountId,
          row.googleRecurringEventId,
          new Date(row.scheduledAt).getTime(),
          { startAt: newAt, durationMinutes },
          { notify: false }
        );
      } else if (row.googleEventId) {
        await g.patchEventTimes(accountId, row.googleEventId, newAt, durationMinutes);
      }
    } catch (err) {
      console.warn("[correctSessionDate] Google move failed:", err);
    }

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/calendar");
    revalidatePath("/payments");
    revalidatePath("/today");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't change the date.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Time off — block a range: cancel everything inside it, one email per client
// ─────────────────────────────────────────────────────────────────────────────

type TimeOffHit = {
  sessionId: string | null; // null = a series occurrence not materialized yet
  clientId: string;
  clientName: string;
  scheduledAt: Date;
  type: string;
  seriesId: string | null;
  occurrenceIndex: number | null;
  googleEventId: string | null;
  googleRecurringEventId: string | null;
  recallBotId: string | null;
  // For not-yet-materialized occurrences: what to insert as the skip marker.
  seriesDurationMinutes?: number;
  seriesIntention?: string | null;
  seriesLocationType?: string;
  seriesGoogleRecurringEventId?: string | null;
};

/** Everything that would be cancelled by a time-off range: upcoming scheduled
 *  sessions inside it, plus series occurrences inside it that the rolling
 *  window hasn't created yet (they get skip markers so the cron never fills
 *  the gap). */
async function collectTimeOffHits(
  accountId: string,
  from: Date,
  to: Date
): Promise<TimeOffHit[]> {
  const now = new Date();
  const lower = from.getTime() > now.getTime() ? from : now;
  const rows = await db
    .select({
      sessionId: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.fullName,
      scheduledAt: sessions.scheduledAt,
      type: sessions.type,
      seriesId: sessions.seriesId,
      occurrenceIndex: sessions.occurrenceIndex,
      googleEventId: sessions.googleEventId,
      googleRecurringEventId: sessions.googleRecurringEventId,
      recallBotId: sessions.recallBotId,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(
      and(
        eq(sessions.accountId, accountId),
        eq(sessions.status, "scheduled"),
        sql`${sessions.scheduledAt} >= ${lower.toISOString()}`,
        sql`${sessions.scheduledAt} <= ${to.toISOString()}`
      )
    )
    .orderBy(asc(sessions.scheduledAt));
  const hits: TimeOffHit[] = rows.map((r) => ({
    ...r,
    scheduledAt: new Date(r.scheduledAt),
  }));

  // Series occurrences beyond the materialized window.
  const series = await db
    .select({
      id: sessionSeries.id,
      clientId: sessionSeries.clientId,
      clientName: clients.fullName,
      type: sessionSeries.type,
      frequency: sessionSeries.frequency,
      firstAt: sessionSeries.firstAt,
      anchorIndex: sessionSeries.anchorIndex,
      occurrenceCount: sessionSeries.occurrenceCount,
      materializedThroughIndex: sessionSeries.materializedThroughIndex,
      durationMinutes: sessionSeries.durationMinutes,
      intention: sessionSeries.intention,
      locationType: sessionSeries.locationType,
      googleRecurringEventId: sessionSeries.googleRecurringEventId,
      practiceTz: practitionerSettings.timezone,
    })
    .from(sessionSeries)
    .innerJoin(clients, eq(clients.id, sessionSeries.clientId))
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, sessionSeries.accountId)
    )
    .where(
      and(
        eq(sessionSeries.accountId, accountId),
        isNull(sessionSeries.cancelledAt),
        sql`${sessionSeries.materializedThroughIndex} < ${sessionSeries.occurrenceCount}`
      )
    );
  for (const s of series) {
    const tz = resolveTimeZone(s.practiceTz);
    const rule = {
      firstAt: new Date(s.firstAt),
      frequency: s.frequency as "weekly" | "biweekly" | "monthly",
      anchorIndex: s.anchorIndex,
    };
    for (let k = s.materializedThroughIndex + 1; k <= s.occurrenceCount; k++) {
      const at = ruleInstant(rule, k, tz);
      if (at.getTime() > to.getTime()) break;
      if (at.getTime() < lower.getTime()) continue;
      hits.push({
        sessionId: null,
        clientId: s.clientId,
        clientName: s.clientName,
        scheduledAt: at,
        type: s.type,
        seriesId: s.id,
        occurrenceIndex: k,
        googleEventId: null,
        googleRecurringEventId: null,
        recallBotId: null,
        seriesDurationMinutes: s.durationMinutes,
        seriesIntention: s.intention,
        seriesLocationType: s.locationType,
        seriesGoogleRecurringEventId: s.googleRecurringEventId,
      });
    }
  }
  return hits.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

export type TimeOffPreview =
  | {
      ok: true;
      sessions: {
        clientId: string;
        clientName: string;
        scheduledAt: string;
        type: string;
        notYetCreated: boolean;
      }[];
      clients: number;
    }
  | { ok: false; error: string };

export async function previewTimeOff(
  fromIso: string,
  toIso: string
): Promise<TimeOffPreview> {
  try {
    const { accountId } = await requireSession();
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { ok: false, error: "Pick both dates." };
    }
    if (to.getTime() < from.getTime()) {
      return { ok: false, error: "The end date is before the start date." };
    }
    const hits = await collectTimeOffHits(accountId, from, to);
    return {
      ok: true,
      sessions: hits.map((h) => ({
        clientId: h.clientId,
        clientName: h.clientName,
        scheduledAt: h.scheduledAt.toISOString(),
        type: h.type,
        notYetCreated: h.sessionId === null,
      })),
      clients: new Set(hits.map((h) => h.clientId)).size,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't preview that range.",
    };
  }
}

export type ApplyTimeOffResult =
  | { ok: true; cancelled: number; clients: number; emailed: number }
  | { ok: false; error: string };

/** Block a range. Every upcoming session inside it is cancelled (bots called
 *  off, Google entries removed silently), series gaps are pinned so the cron
 *  can't refill them, new bookings inside the range are refused, and each
 *  affected client gets ONE email listing their dates and when you're back. */
export async function applyTimeOff(formData: FormData): Promise<ApplyTimeOffResult> {
  try {
    const { accountId } = await requireSession();
    const from = new Date(required(str(formData, "from"), "Start"));
    const to = new Date(required(str(formData, "to"), "End"));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { ok: false, error: "Pick both dates." };
    }
    if (to.getTime() < from.getTime()) {
      return { ok: false, error: "The end date is before the start date." };
    }
    const note = str(formData, "note");
    const notifyClients = str(formData, "notifyClients") !== "false";
    const now = new Date();

    const { timeOff } = await import("@/db/schema");
    const [block] = await db
      .insert(timeOff)
      .values({ accountId, startsAt: from, endsAt: to, note })
      .returning({ id: timeOff.id });

    const hits = await collectTimeOffHits(accountId, from, to);
    const byClient = new Map<string, TimeOffHit[]>();
    for (const h of hits) {
      const list = byClient.get(h.clientId) ?? [];
      list.push(h);
      byClient.set(h.clientId, list);
    }

    let cancelled = 0;
    for (const h of hits) {
      if (h.sessionId) {
        // An existing upcoming session: same steps as "Cancel this one", minus
        // the per-session email.
        if (h.recallBotId) {
          try {
            const { cancelBot } = await import("./recall");
            await cancelBot(h.recallBotId);
          } catch (err) {
            console.warn("[timeOff] bot cancel failed:", err);
          }
        }
        await db
          .update(sessions)
          .set({
            status: "cancelled",
            recallBotId: null,
            recallBotStatus: null,
            updatedAt: now,
          })
          .where(and(eq(sessions.accountId, accountId), eq(sessions.id, h.sessionId)));
        try {
          if (h.googleRecurringEventId) {
            const { cancelRecurringInstance } = await import("./google-calendar");
            await cancelRecurringInstance(
              accountId,
              h.googleRecurringEventId,
              h.scheduledAt.getTime(),
              { notify: false }
            );
            await db
              .update(sessions)
              .set({ googleRecurringEventId: null })
              .where(and(eq(sessions.accountId, accountId), eq(sessions.id, h.sessionId)));
          } else if (h.googleEventId) {
            await deleteSessionFromGoogle(accountId, h.googleEventId, { notify: false });
            await db
              .update(sessions)
              .set({ googleEventId: null })
              .where(and(eq(sessions.accountId, accountId), eq(sessions.id, h.sessionId)));
          }
        } catch (err) {
          console.warn("[timeOff] Google cleanup failed:", err);
        }
        cancelled++;
      } else if (h.seriesId && h.occurrenceIndex != null) {
        // A series occurrence the window hasn't created yet: pin a cancelled
        // skip marker so the cron never fills the gap, and drop the instance
        // from the shared Google event.
        const [made] = await db
          .insert(sessions)
          .values({
            accountId,
            clientId: h.clientId,
            type: h.type,
            status: "cancelled",
            scheduledAt: h.scheduledAt,
            durationMinutes: h.seriesDurationMinutes ?? 60,
            intention: h.seriesIntention ?? null,
            seriesId: h.seriesId,
            occurrenceIndex: h.occurrenceIndex,
            locationType: h.seriesLocationType ?? "online",
          })
          .onConflictDoNothing()
          .returning({ id: sessions.id });
        if (made) {
          cancelled++;
          if (h.seriesGoogleRecurringEventId) {
            try {
              const { cancelRecurringInstance } = await import("./google-calendar");
              await cancelRecurringInstance(
                accountId,
                h.seriesGoogleRecurringEventId,
                h.scheduledAt.getTime(),
                { notify: false }
              );
            } catch (err) {
              console.warn("[timeOff] Google instance cancel failed:", err);
            }
          }
        }
      }
    }

    // One email per client.
    let emailed = 0;
    if (notifyClients && byClient.size > 0) {
      try {
        const { isResendConfigured } = await import("./resend");
        if (isResendConfigured()) {
          const [settings] = await db
            .select({
              practitionerName: practitionerSettings.practitionerName,
              businessEmail: practitionerSettings.businessEmail,
              practiceTz: practitionerSettings.timezone,
            })
            .from(practitionerSettings)
            .where(eq(practitionerSettings.accountId, accountId))
            .limit(1);
          const { sendTimeOffEmail } = await import("./series-email");
          for (const [clientId, list] of byClient) {
            const [c] = await db
              .select({
                email: clients.email,
                fullName: clients.fullName,
                timezone: clients.timezone,
                language: clients.preferredLanguage,
              })
              .from(clients)
              .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)))
              .limit(1);
            if (!c?.email) continue;
            const [next] = await db
              .select({ at: sessions.scheduledAt })
              .from(sessions)
              .where(
                and(
                  eq(sessions.accountId, accountId),
                  eq(sessions.clientId, clientId),
                  eq(sessions.status, "scheduled"),
                  sql`${sessions.scheduledAt} > ${to.toISOString()}`
                )
              )
              .orderBy(asc(sessions.scheduledAt))
              .limit(1);
            await sendTimeOffEmail({
              to: c.email,
              clientName: c.fullName,
              practitionerName: settings?.practitionerName ?? null,
              replyTo: settings?.businessEmail ?? undefined,
              timeZone: resolveTimeZone(c.timezone, settings?.practiceTz),
              language: c.language === "uk" ? "uk" : "en",
              from,
              to_: to,
              cancelledDates: list.map((h) => h.scheduledAt),
              resumesAt: next ? new Date(next.at) : null,
              note,
            });
            emailed++;
          }
        }
      } catch (err) {
        console.warn("[timeOff] emails failed:", err);
      }
    }

    if (block) {
      await db
        .update(timeOff)
        .set({ sessionsCancelled: cancelled })
        .where(eq(timeOff.id, block.id));
    }

    revalidatePath("/calendar");
    revalidatePath("/today");
    revalidatePath("/clients");
    revalidatePath("/payments");
    return { ok: true, cancelled, clients: byClient.size, emailed };
  } catch (err) {
    console.error("[applyTimeOff] failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't apply the time off.",
    };
  }
}

export async function cancelBotForSession(
  sessionId: string
): Promise<CancelBotResult> {
  try {
    const { accountId } = await requireSession();
    const [sess] = await db
      .select({ botId: sessions.recallBotId })
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .limit(1);
    if (!sess) return { ok: false, error: "Session not found" };

    if (sess.botId) {
      const { cancelBot } = await import("./recall");
      await cancelBot(sess.botId);
    }

    // Status "cancelled" (with no bot id) tells the cron sweep she called
    // this one off on purpose — otherwise it would re-add a bot ~40 min
    // before the session. Also how a "queued" series occurrence is un-queued.
    await db
      .update(sessions)
      .set({
        recallBotId: null,
        recallBotStatus: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      );

    const [s] = await db
      .select({ clientId: sessions.clientId })
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .limit(1);
    if (s) revalidatePath(`/clients/${s.clientId}`);

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to cancel bot",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING SERIES
//
// Creates a series row + generates N session rows at the chosen cadence.
// Capped at 52 occurrences (one year of weekly) to avoid runaway inserts.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_OCCURRENCES = 52;

export type ScheduleSeriesResult =
  | { ok: true; seriesId: string; created: number }
  | { ok: false; error: string };

export async function scheduleSessionSeries(
  formData: FormData
): Promise<ScheduleSeriesResult> {
  try {
    const { accountId } = await requireSession();
    const clientId = required(str(formData, "clientId"), "Client");
    const type = str(formData, "type") ?? "Session";
    const firstAtRaw = required(str(formData, "firstAt"), "First session date/time");
    const durationMinutes = num(formData, "durationMinutes") ?? 60;
    const intention = str(formData, "intention");
    // Online (Meet + notetaker) or in person (no Meet, no bot — she records in
    // the room). Same rule as a single session. Stored on the series so rows
    // the cron materializes later inherit it; any one occurrence can still be
    // flipped on its own card.
    const isInPerson = str(formData, "locationType") === "in_person";
    const locationType = isInPerson ? "in_person" : "online";
    const frequencyRaw = str(formData, "frequency") ?? "weekly";
    if (
      frequencyRaw !== "weekly" &&
      frequencyRaw !== "biweekly" &&
      frequencyRaw !== "monthly"
    ) {
      return { ok: false, error: "Invalid frequency" };
    }
    const frequency = frequencyRaw;

    const countRaw = num(formData, "occurrenceCount") ?? 0;
    if (countRaw < 1 || countRaw > MAX_OCCURRENCES) {
      return {
        ok: false,
        error: `Number of sessions must be between 1 and ${MAX_OCCURRENCES}.`,
      };
    }
    const occurrenceCount = Math.floor(countRaw);

    const firstAt = new Date(firstAtRaw);
    if (Number.isNaN(firstAt.getTime())) {
      return { ok: false, error: "Couldn't parse the first session date/time." };
    }

    // Prefer the dates the CLIENT computed (it knows the practitioner's local
    // timezone, so weekly/biweekly/monthly math survives DST boundaries —
    // "Monday 10am" stays 10am local across the spring/fall shift). Fall back
    // to a server-side computation if the field is missing (older clients, or
    // somebody scripting the action).
    // Server-side fallback for the date list (older clients / scripted calls):
    // DST-correct in the PRACTICE timezone, the same algorithm the cron top-up
    // uses — never naive UTC arithmetic, which drifts an hour across the shift.
    const [tzRow] = await db
      .select({ timezone: practitionerSettings.timezone })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, accountId))
      .limit(1);
    const seriesTz = resolveTimeZone(str(formData, "timezone"), tzRow?.timezone);
    const fallbackDates = () =>
      Array.from({ length: occurrenceCount }, (_, i) =>
        occurrenceInstant(firstAt, frequency, i + 1, seriesTz)
      );

    let dates: Date[];
    const computedDatesRaw = str(formData, "computedDates");
    if (computedDatesRaw) {
      try {
        const parsed = JSON.parse(computedDatesRaw);
        if (
          Array.isArray(parsed) &&
          parsed.length === occurrenceCount &&
          parsed.every((s) => typeof s === "string")
        ) {
          dates = parsed.map((s) => new Date(s));
          if (dates.some((d) => Number.isNaN(d.getTime()))) {
            dates = fallbackDates();
          }
        } else {
          dates = fallbackDates();
        }
      } catch {
        dates = fallbackDates();
      }
    } else {
      dates = fallbackDates();
    }

    // Duplicate-submit guard. On 2026-09-04/05 the same series was created 21
    // times in a few minutes: the action ran long (52 Google events + 52
    // Recall bots), the request timed out, the dialog showed an error, and
    // each retry inserted another full copy — 1,000+ sessions, 400 bots. The
    // rows always land before the slow hooks, so a retry after an error is
    // a duplicate, never a repair. Refuse a same-client, same-start, same-
    // cadence series created in the last 30 minutes and point at it.
    const dupCutoff = new Date(Date.now() - 30 * 60 * 1000);
    const [dup] = await db
      .select({ id: sessionSeries.id, createdAt: sessionSeries.createdAt })
      .from(sessionSeries)
      .where(
        and(
          eq(sessionSeries.accountId, accountId),
          eq(sessionSeries.clientId, clientId),
          eq(sessionSeries.frequency, frequency),
          eq(sessionSeries.firstAt, firstAt),
          isNull(sessionSeries.cancelledAt),
          sql`${sessionSeries.createdAt} > ${dupCutoff.toISOString()}`
        )
      )
      .limit(1);
    if (dup) {
      const mins = Math.max(
        1,
        Math.round((Date.now() - new Date(dup.createdAt).getTime()) / 60000)
      );
      return {
        ok: false,
        error: `This series already exists — an identical one for this client was created ${mins} min ago. Check their profile before creating another (if that one looks wrong, cancel it there first).`,
      };
    }

    // Create the series row first so we can link sessions to it
    const [seriesRow] = await db
      .insert(sessionSeries)
      .values({
        accountId,
        clientId,
        type,
        frequency,
        durationMinutes,
        firstAt,
        occurrenceCount,
        intention,
        locationType,
      })
      .returning({ id: sessionSeries.id });

    // Materialize only a BOUNDED WINDOW, not the whole series. Past-dated
    // occurrences are back-fill (kept in full — real history she asked for).
    // Future occurrences are materialized only through SERIES_HORIZON_WEEKS;
    // the reminders cron tops the window up as time passes (recurring-sessions.ts).
    // This is what stops a 52-week series from landing 52 rows at once — the
    // bloat that froze the two profiles. occurrenceIndex is kept 1-based over
    // the FULL series so the cron top-up dedupes against the same indices.
    const now = new Date();
    const horizonEnd = new Date(
      now.getTime() + SERIES_HORIZON_WEEKS * 7 * 86_400_000
    );
    // The FIRST future occurrence is always materialized, even when it lies
    // beyond the horizon: it anchors the one recurring Google event, the
    // confirmation email and the notetaker queue. A series starting three
    // months out would otherwise have no row to hang any of that on.
    const firstFutureIndex =
      dates.findIndex((d) => d.getTime() > now.getTime()) + 1; // 0 = none
    const sessionRows = dates
      .map((scheduledAt, i) => ({ scheduledAt, index: i + 1 }))
      .filter(
        ({ scheduledAt, index }) =>
          scheduledAt.getTime() < now.getTime() || // past → back-fill
          scheduledAt.getTime() <= horizonEnd.getTime() || // future within window
          index === firstFutureIndex
      )
      .map(({ scheduledAt, index }) => ({
        accountId,
        clientId,
        type,
        // Past dates land as 'completed' (back-fill); future dates 'scheduled'.
        status: (scheduledAt.getTime() < now.getTime()
          ? "completed"
          : "scheduled") as "completed" | "scheduled",
        scheduledAt,
        durationMinutes,
        intention,
        seriesId: seriesRow.id,
        occurrenceIndex: index,
        locationType,
      }));

    const inserted = await db
      .insert(sessions)
      .values(sessionRows)
      .returning({
        id: sessions.id,
        scheduledAt: sessions.scheduledAt,
        status: sessions.status,
      });

    // High-water mark for the lazy top-up: every index up to the highest one
    // we just created is "handled". The cron only ever materializes ABOVE it,
    // so an occurrence she later deletes is never resurrected. (The window is
    // contiguous from index 1, so there are no gaps below the mark.)
    const materializedThrough = sessionRows.reduce(
      (m, r) => Math.max(m, r.occurrenceIndex),
      0
    );
    await db
      .update(sessionSeries)
      .set({ materializedThroughIndex: materializedThrough, updatedAt: now })
      .where(eq(sessionSeries.id, seriesRow.id));

    // Same auto-promote logic as the single-session case — if this client
    // was still in the network, kicking off a series moves them out.
    await db
      .update(clients)
      .set({ isLead: false, updatedAt: new Date() })
      .where(
        and(
          eq(clients.accountId, accountId),
          eq(clients.id, clientId),
          eq(clients.isLead, true)
        )
      );

    // Fulfillment for the FUTURE occurrences. This used to be missing entirely:
    // a series was a bare INSERT, so every session came out online with no Meet
    // link, no Google event, no calendar invite — and, with no Meet link, no
    // notetaker bot, so AI notes silently never generated for series clients.
    // Sync each future session to Google (event + Meet link, which also invites
    // the client) and schedule a bot, exactly like a standalone booking. Past-
    // dated rows are back-fill — already happened, nothing to invite anyone to —
    // so they're skipped. Best-effort per session: a Calendar or Recall hiccup
    // must never undo the series that's already saved, and any session left
    // unsynced is caught later by "Sync all to Google" / the self-heal path.
    const nowMs = Date.now();
    const future = inserted
      .filter(
        (s) => s.status === "scheduled" && new Date(s.scheduledAt).getTime() > nowMs
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );
    // The recurring Google event must cover the ENTIRE remaining series (its
    // RRULE/RDATE), even though we only materialized the window as rows above.
    // Rows the cron tops up later inherit this same event — no new Google call.
    const allFutureDates = dates
      .filter((d) => d.getTime() > nowMs)
      .sort((a, b) => a.getTime() - b.getTime());
    // ONE recurring Google event for the whole series — NOT one event per
    // occurrence. Creating 52 separate events fired a "new event added to your
    // calendar" email per occurrence (dozens at once). A single recurring event
    // is one calendar entry, one notification. Built from the first future
    // occurrence with an RRULE; every future session shares its Meet link and is
    // linked by googleRecurringEventId so reschedule/cancel-one can address its
    // own instance. Best-effort: a Google hiccup never undoes the saved series.
    // An in-person series skips Google AND the notetaker queue entirely — the
    // same rule as a single in-person session (no Meet to generate; she records
    // in the room). The schedule email below still goes out.
    if (future.length > 0 && !isInPerson) {
      if (allFutureDates.length >= 2) {
        try {
          const { recurrenceForSeries } = await import("./google-calendar");
          const recurring = await syncSeriesToGoogle(
            future[0].id,
            recurrenceForSeries(frequency, allFutureDates)
          );
          if (recurring) {
            await db
              .update(sessions)
              .set({
                googleRecurringEventId: recurring.recurringEventId,
                meetUrl: recurring.meetUrl,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(sessions.accountId, accountId),
                  eq(sessions.seriesId, seriesRow.id),
                  eq(sessions.status, "scheduled")
                )
              );
            // Remember it on the SERIES too. Rows the cron materializes later
            // inherit from here, and cancel-series can still find the event
            // after every materialized occurrence was cancelled or detached
            // (both of which null the id on their own rows).
            await db
              .update(sessionSeries)
              .set({
                googleRecurringEventId: recurring.recurringEventId,
                meetUrl: recurring.meetUrl,
                updatedAt: new Date(),
              })
              .where(eq(sessionSeries.id, seriesRow.id));
          }
        } catch (err) {
          console.error(
            "[scheduleSessionSeries] recurring Google event failed:",
            err
          );
        }
      } else {
        // A one-occurrence "series" is just a session. An RRULE with COUNT=1
        // is pointless and — worse — would stamp googleRecurringEventId on a
        // NON-recurring event, so cancel/reschedule-one would call
        // events.instances on it and fail, orphaning the event. Sync it as a
        // plain standalone event instead (creates it + invites the client).
        try {
          await syncSessionToGoogle(future[0].id);
        } catch (err) {
          console.error(
            "[scheduleSessionSeries] single-occurrence Google sync failed:",
            err
          );
        }
      }
      // Notetaker bots are NOT created here. Doing so fired one Recall call
      // per occurrence (52 in a burst → Recall's 120/min limit, silent
      // failures past it, and hundreds of scheduled bots parked in Recall for
      // months). Instead each occurrence is marked "queued" and the cron
      // sweep (recall-scheduler.ts) sends its bot ~40 min before it starts.
      try {
        const { queueRecallForSeries } = await import("./recall-scheduler");
        await queueRecallForSeries(accountId, seriesRow.id);
      } catch (err) {
        console.warn("[scheduleSessionSeries] recall queue failed:", err);
      }
    }

    // ONE confirmation for the whole series — the client would otherwise get an
    // app email per occurrence. Send it for the first upcoming session (Google
    // has already invited them to each). Also run the short-notice reminder
    // check for that first session in case the series starts inside a reminder
    // window.
    if (future.length > 0) {
      // ONE email describing the whole series (rhythm, count, next dates,
      // where) — not the single-session "You're booked" for occurrence #1.
      await maybeSendSeriesConfirmation(accountId, seriesRow.id, allFutureDates);
      try {
        const { sendImmediateSessionReminders } = await import("./reminders");
        await sendImmediateSessionReminders(future[0].id);
      } catch (err) {
        console.error(
          "[scheduleSessionSeries] immediate reminder check failed:",
          err
        );
      }
    }

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/calendar");
    revalidatePath("/today");
    revalidatePath("/network");

    return { ok: true, seriesId: seriesRow.id, created: sessionRows.length };
  } catch (err) {
    console.error("[scheduleSessionSeries] failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't create the series.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit a recurring series — "this and following"
// ─────────────────────────────────────────────────────────────────────────────

type SeriesFreq = "weekly" | "biweekly" | "monthly";

type SeriesEditRule = {
  firstAt: Date;
  frequency: SeriesFreq;
  anchorIndex: number;
  occurrenceCount: number;
  materializedThroughIndex: number;
};

type SeriesSessionRow = {
  id: string;
  occurrenceIndex: number | null;
  scheduledAt: Date;
  status: string;
  recallBotId: string | null;
  googleRecurringEventId: string | null;
  meetUrl: string | null;
};

async function loadSeriesRows(
  accountId: string,
  seriesId: string
): Promise<SeriesSessionRow[]> {
  return db
    .select({
      id: sessions.id,
      occurrenceIndex: sessions.occurrenceIndex,
      scheduledAt: sessions.scheduledAt,
      status: sessions.status,
      recallBotId: sessions.recallBotId,
      googleRecurringEventId: sessions.googleRecurringEventId,
      meetUrl: sessions.meetUrl,
    })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.seriesId, seriesId)));
}

/** A row still "rides the rule": its time is what the series rule says for
 *  its index. An occurrence she moved individually no longer matches and is
 *  left alone by a series edit — moving one never changes the rest, and the
 *  rest changing never un-moves the one. */
function isAttached(row: SeriesSessionRow, rule: SeriesEditRule, tz: string): boolean {
  if (row.occurrenceIndex == null) return false;
  const expected = ruleInstant(rule, row.occurrenceIndex, tz).getTime();
  return Math.abs(new Date(row.scheduledAt).getTime() - expected) < 60_000;
}

/** The next occurrence a series edit applies from: the earliest upcoming,
 *  still-attached, scheduled row — or, if the window hasn't reached it yet,
 *  the first not-yet-materialized index whose time is still ahead. */
function nextAttachedOccurrence(
  rule: SeriesEditRule,
  rows: SeriesSessionRow[],
  tz: string,
  now: Date
): { index: number; at: Date; rowId: string | null } | null {
  const upcoming = rows
    .filter(
      (r) =>
        r.status === "scheduled" &&
        new Date(r.scheduledAt).getTime() > now.getTime() &&
        isAttached(r, rule, tz)
    )
    .sort((a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0));
  if (upcoming[0]) {
    return {
      index: upcoming[0].occurrenceIndex!,
      at: new Date(upcoming[0].scheduledAt),
      rowId: upcoming[0].id,
    };
  }
  for (let k = rule.materializedThroughIndex + 1; k <= rule.occurrenceCount; k++) {
    const at = ruleInstant(rule, k, tz);
    if (at.getTime() > now.getTime()) return { index: k, at, rowId: null };
  }
  return null;
}

export type SeriesEditContext =
  | {
      ok: true;
      frequency: SeriesFreq;
      type: string;
      durationMinutes: number;
      intention: string | null;
      occurrenceCount: number;
      locationType: "online" | "in_person";
      /** The occurrence the edit applies from (1-based) and its current time. */
      nextIndex: number;
      nextAt: string;
      practiceTz: string;
    }
  | { ok: false; error: string };

/** Everything the Edit-series dialog needs to open pre-filled. */
export async function getSeriesEditContext(
  seriesId: string
): Promise<SeriesEditContext> {
  try {
    const { accountId } = await requireSession();
    const [series] = await db
      .select({
        frequency: sessionSeries.frequency,
        type: sessionSeries.type,
        durationMinutes: sessionSeries.durationMinutes,
        intention: sessionSeries.intention,
        occurrenceCount: sessionSeries.occurrenceCount,
        locationType: sessionSeries.locationType,
        firstAt: sessionSeries.firstAt,
        anchorIndex: sessionSeries.anchorIndex,
        materializedThroughIndex: sessionSeries.materializedThroughIndex,
        cancelledAt: sessionSeries.cancelledAt,
        practiceTz: practitionerSettings.timezone,
      })
      .from(sessionSeries)
      .leftJoin(
        practitionerSettings,
        eq(practitionerSettings.accountId, sessionSeries.accountId)
      )
      .where(and(eq(sessionSeries.accountId, accountId), eq(sessionSeries.id, seriesId)))
      .limit(1);
    if (!series) return { ok: false, error: "Series not found." };
    if (series.cancelledAt) return { ok: false, error: "This series was cancelled." };
    const tz = resolveTimeZone(series.practiceTz);
    const rule: SeriesEditRule = {
      firstAt: new Date(series.firstAt),
      frequency: series.frequency as SeriesFreq,
      anchorIndex: series.anchorIndex,
      occurrenceCount: series.occurrenceCount,
      materializedThroughIndex: series.materializedThroughIndex,
    };
    const rows = await loadSeriesRows(accountId, seriesId);
    const next = nextAttachedOccurrence(rule, rows, tz, new Date());
    if (!next) {
      return {
        ok: false,
        error:
          "Nothing left to change — every session in this series has already happened.",
      };
    }
    return {
      ok: true,
      frequency: rule.frequency,
      type: series.type,
      durationMinutes: series.durationMinutes,
      intention: series.intention,
      occurrenceCount: series.occurrenceCount,
      locationType: series.locationType === "in_person" ? "in_person" : "online",
      nextIndex: next.index,
      nextAt: next.at.toISOString(),
      practiceTz: tz,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't load the series.",
    };
  }
}

export type EditSeriesResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

/**
 * Edit a recurring series "this and following": a new day/time, rhythm,
 * length, title, intention, total count, or online/in person — applied from
 * the NEXT occurrence onward.
 *
 * What stays untouched, always: every past session; any upcoming occurrence
 * she moved individually (it no longer rides the rule); any she cancelled
 * individually (still a "skip" marker). Google follows the same "this and
 * following" model: the existing recurring event is truncated at now (its
 * held instances stay on her calendar) and a fresh one is created from the
 * next occurrence. A title/intention-only change just renames the event.
 * The client gets ONE "updated schedule" email (optional).
 */
export async function editSessionSeries(
  formData: FormData
): Promise<EditSeriesResult> {
  try {
    const { accountId } = await requireSession();
    const seriesId = required(str(formData, "seriesId"), "Series");
    const clientId = required(str(formData, "clientId"), "Client");
    const type = str(formData, "type") ?? "Session";
    const durationMinutes = Math.max(
      5,
      Math.min(180, num(formData, "durationMinutes") ?? 60)
    );
    const intention = str(formData, "intention");
    const frequencyRaw = str(formData, "frequency") ?? "weekly";
    if (
      frequencyRaw !== "weekly" &&
      frequencyRaw !== "biweekly" &&
      frequencyRaw !== "monthly"
    ) {
      return { ok: false, error: "Invalid frequency" };
    }
    const frequency: SeriesFreq = frequencyRaw;
    const isInPerson = str(formData, "locationType") === "in_person";
    const locationType = isInPerson ? "in_person" : "online";
    const notifyClient = str(formData, "notifyClient") !== "false";
    const newTotal = Math.floor(num(formData, "occurrenceCount") ?? 0);
    const newAnchor = new Date(required(str(formData, "firstAt"), "Next session date/time"));
    if (Number.isNaN(newAnchor.getTime())) {
      return { ok: false, error: "Couldn't read the next session's date and time." };
    }
    const now = new Date();
    if (newAnchor.getTime() <= now.getTime()) {
      return { ok: false, error: "Pick a date and time in the future for the next session." };
    }

    const [series] = await db
      .select({
        type: sessionSeries.type,
        frequency: sessionSeries.frequency,
        durationMinutes: sessionSeries.durationMinutes,
        intention: sessionSeries.intention,
        firstAt: sessionSeries.firstAt,
        anchorIndex: sessionSeries.anchorIndex,
        occurrenceCount: sessionSeries.occurrenceCount,
        materializedThroughIndex: sessionSeries.materializedThroughIndex,
        locationType: sessionSeries.locationType,
        googleRecurringEventId: sessionSeries.googleRecurringEventId,
        cancelledAt: sessionSeries.cancelledAt,
        practiceTz: practitionerSettings.timezone,
      })
      .from(sessionSeries)
      .leftJoin(
        practitionerSettings,
        eq(practitionerSettings.accountId, sessionSeries.accountId)
      )
      .where(and(eq(sessionSeries.accountId, accountId), eq(sessionSeries.id, seriesId)))
      .limit(1);
    if (!series) return { ok: false, error: "Series not found." };
    if (series.cancelledAt) return { ok: false, error: "This series was cancelled." };

    const tz = resolveTimeZone(series.practiceTz);
    const rule: SeriesEditRule = {
      firstAt: new Date(series.firstAt),
      frequency: series.frequency as SeriesFreq,
      anchorIndex: series.anchorIndex,
      occurrenceCount: series.occurrenceCount,
      materializedThroughIndex: series.materializedThroughIndex,
    };
    const rows = await loadSeriesRows(accountId, seriesId);
    const next = nextAttachedOccurrence(rule, rows, tz, now);
    if (!next) {
      return {
        ok: false,
        error: "Nothing left to change — every session in this series has already happened.",
      };
    }
    const nextIndex = next.index;
    if (newTotal < nextIndex) {
      return {
        ok: false,
        error: `Keep at least ${nextIndex} sessions — that's the one coming up. To end the series instead, use "Cancel whole series".`,
      };
    }
    if (newTotal > MAX_OCCURRENCES) {
      return { ok: false, error: `A series holds at most ${MAX_OCCURRENCES} sessions.` };
    }

    // New instants for occurrences nextIndex..newTotal. Prefer the dialog's
    // list (computed in the practice zone, DST-correct); fall back to the same
    // math server-side.
    const remaining = newTotal - nextIndex + 1;
    let newDates: Date[] | null = null;
    const computedRaw = str(formData, "computedDates");
    if (computedRaw) {
      try {
        const parsed = JSON.parse(computedRaw);
        if (Array.isArray(parsed) && parsed.length === remaining) {
          const ds = parsed.map((s: unknown) => new Date(String(s)));
          if (ds.every((d) => !Number.isNaN(d.getTime()))) newDates = ds;
        }
      } catch {
        /* fall through to server math */
      }
    }
    if (!newDates) {
      newDates = Array.from({ length: remaining }, (_, i) =>
        occurrenceInstant(newAnchor, frequency, i + 1, tz)
      );
    }

    const scheduleShaping =
      frequency !== rule.frequency ||
      durationMinutes !== series.durationMinutes ||
      newTotal !== series.occurrenceCount ||
      locationType !== series.locationType ||
      Math.abs(newAnchor.getTime() - next.at.getTime()) >= 60_000;
    const textOnly =
      !scheduleShaping &&
      (type !== series.type || (intention ?? null) !== (series.intention ?? null));
    if (!scheduleShaping && !textOnly) return { ok: true, updated: 0 };

    const futureAttached = rows
      .filter(
        (r) =>
          r.status === "scheduled" &&
          new Date(r.scheduledAt).getTime() > now.getTime() &&
          isAttached(r, rule, tz) &&
          (r.occurrenceIndex ?? 0) >= nextIndex
      )
      .sort((a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0));

    if (scheduleShaping) {
      // 1) Bots already sent are for the OLD times / meeting — call them off.
      //    The sweep re-queues fresh ones for the new times (online only).
      for (const r of futureAttached) {
        if (!r.recallBotId) continue;
        try {
          const { cancelBot } = await import("./recall");
          await cancelBot(r.recallBotId);
        } catch (err) {
          console.warn("[editSessionSeries] bot cancel failed:", err);
        }
      }
      // 2) Google, "this and following": keep held instances of the old event
      //    on her calendar, drop its future ones; a fresh event follows below.
      const oldEvent = series.googleRecurringEventId;
      if (oldEvent) {
        const held = rows.some(
          (r) =>
            r.googleRecurringEventId === oldEvent &&
            new Date(r.scheduledAt).getTime() <= now.getTime()
        );
        try {
          const gcal = await import("./google-calendar");
          if (held) {
            await gcal.truncateRecurringEvent(accountId, oldEvent, now.getTime(), {
              notify: false,
            });
          } else {
            await gcal.deleteCalendarEventsForSessions(
              accountId,
              [{ id: futureAttached[0]?.id ?? seriesId, googleEventId: oldEvent }],
              { notify: false }
            );
          }
        } catch (err) {
          console.warn("[editSessionSeries] Google this-and-following failed:", err);
        }
      }
    }

    // 3) A shortened series drops its tail (the Google side is handled above).
    const tail = futureAttached.filter((r) => (r.occurrenceIndex ?? 0) > newTotal);
    if (tail.length > 0) {
      await db.delete(sessions).where(
        and(
          eq(sessions.accountId, accountId),
          inArray(
            sessions.id,
            tail.map((r) => r.id)
          )
        )
      );
    }

    // 4) The kept upcoming occurrences take the new shape.
    const kept = futureAttached.filter((r) => (r.occurrenceIndex ?? 0) <= newTotal);
    for (const r of kept) {
      const at = newDates[(r.occurrenceIndex ?? nextIndex) - nextIndex];
      const patch: Partial<typeof sessions.$inferInsert> = {
        type,
        intention,
        durationMinutes,
        locationType,
        updatedAt: now,
      };
      if (scheduleShaping) {
        Object.assign(patch, {
          scheduledAt: at,
          // Re-stamped below once the new Google event exists (online).
          googleRecurringEventId: null,
          meetUrl: null,
          recallBotId: null,
          recallBotStatus: isInPerson ? "cancelled" : null,
          // A moved time deserves fresh reminders + nudges.
          clientReminderSentAt: null,
          practitionerReminderSentAt: null,
          walkInNudgeSentAt: null,
          clientWalkInNudgeSentAt: null,
        });
      }
      await db
        .update(sessions)
        .set(patch)
        .where(and(eq(sessions.accountId, accountId), eq(sessions.id, r.id)));
    }

    // 5) The rule itself. Re-anchor at the next occurrence when the schedule
    //    changed; earlier occurrences are rows already and keep their dates.
    await db
      .update(sessionSeries)
      .set({
        type,
        intention,
        durationMinutes,
        frequency,
        occurrenceCount: newTotal,
        locationType,
        ...(scheduleShaping
          ? {
              firstAt: newAnchor,
              anchorIndex: nextIndex,
              googleRecurringEventId: null,
              meetUrl: null,
            }
          : {}),
        materializedThroughIndex: Math.min(series.materializedThroughIndex, newTotal),
        updatedAt: now,
      })
      .where(and(eq(sessionSeries.accountId, accountId), eq(sessionSeries.id, seriesId)));

    // 6) The next occurrence must exist as a row — it anchors the new Google
    //    event and the email. (It may sit beyond the materialization window.)
    let nextRowId = kept.find((r) => r.occurrenceIndex === nextIndex)?.id ?? null;
    let insertedNext = 0;
    if (!nextRowId) {
      const [made] = await db
        .insert(sessions)
        .values({
          accountId,
          clientId,
          type,
          status: "scheduled",
          scheduledAt: newDates[0],
          durationMinutes,
          intention,
          seriesId,
          occurrenceIndex: nextIndex,
          locationType,
          recallBotStatus: isInPerson ? "cancelled" : null,
        })
        .onConflictDoNothing()
        .returning({ id: sessions.id });
      if (made) {
        nextRowId = made.id;
        insertedNext = 1;
        await db
          .update(sessionSeries)
          .set({
            materializedThroughIndex: sql`GREATEST(${sessionSeries.materializedThroughIndex}, ${nextIndex})`,
          })
          .where(eq(sessionSeries.id, seriesId));
      }
    }

    // 7) Google going forward.
    if (!isInPerson && nextRowId) {
      if (scheduleShaping) {
        try {
          if (newDates.length >= 2) {
            const { recurrenceForSeries } = await import("./google-calendar");
            const recurring = await syncSeriesToGoogle(
              nextRowId,
              recurrenceForSeries(frequency, newDates)
            );
            if (recurring) {
              const ids = [...kept.map((r) => r.id), nextRowId];
              await db
                .update(sessions)
                .set({
                  googleRecurringEventId: recurring.recurringEventId,
                  meetUrl: recurring.meetUrl,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(sessions.accountId, accountId),
                    inArray(sessions.id, [...new Set(ids)])
                  )
                );
              await db
                .update(sessionSeries)
                .set({
                  googleRecurringEventId: recurring.recurringEventId,
                  meetUrl: recurring.meetUrl,
                  updatedAt: new Date(),
                })
                .where(eq(sessionSeries.id, seriesId));
            }
          } else {
            // One occurrence left: a plain standalone event, never an RRULE
            // with COUNT=1 (see scheduleSessionSeries).
            await syncSessionToGoogle(nextRowId);
          }
        } catch (err) {
          console.error("[editSessionSeries] Google event failed:", err);
        }
      } else if (textOnly && series.googleRecurringEventId) {
        try {
          const [client] = await db
            .select({ fullName: clients.fullName, workingOn: clients.workingOn })
            .from(clients)
            .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)))
            .limit(1);
          const { patchRecurringEventText } = await import("./google-calendar");
          await patchRecurringEventText(accountId, series.googleRecurringEventId, {
            summary: `${type} · ${client?.fullName ?? ""}`.trim(),
            description: [
              intention ? `Intention: "${intention}"` : null,
              client?.workingOn ? `Working on: ${client.workingOn}` : null,
              "—",
              "Recurring series created by Soul Service",
            ]
              .filter(Boolean)
              .join("\n"),
          });
        } catch (err) {
          console.warn("[editSessionSeries] Google rename failed:", err);
        }
      }
      // Fresh bots for the new times, just-in-time via the sweep.
      try {
        const { queueRecallForSeries } = await import("./recall-scheduler");
        await queueRecallForSeries(accountId, seriesId);
      } catch (err) {
        console.warn("[editSessionSeries] recall queue failed:", err);
      }
    }

    // 8) ONE "updated schedule" email — never a cancel + new pair.
    if (notifyClient) {
      await maybeSendSeriesConfirmation(accountId, seriesId, newDates, { updated: true });
    }

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/calendar");
    revalidatePath("/today");
    return { ok: true, updated: kept.length + insertedNext };
  } catch (err) {
    console.error("[editSessionSeries] failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't update the series.",
    };
  }
}

/**
 * Cancel a whole series — marks the series cancelled and deletes all FUTURE
 * scheduled sessions linked to it. Past + completed sessions stay (they're
 * history). Used by the "Cancel series" button.
 */
export async function cancelSessionSeries(
  seriesId: string,
  clientId: string,
  /** notifyClient:false = quiet cancel — no email to the client. (Google is
   *  always silent here; the app's one email is the only notice.) */
  opts: { notifyClient?: boolean } = {}
): Promise<void> {
  const notifyClient = opts.notifyClient !== false;
  const { accountId } = await requireSession();
  const now = new Date();

  // Mark the series cancelled — scoped by account to prevent cross-account hits.
  await db
    .update(sessionSeries)
    .set({ cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(sessionSeries.accountId, accountId),
        eq(sessionSeries.id, seriesId)
      )
    );

  // Gather the future scheduled sessions BEFORE deleting them — we need their
  // Google event IDs to clean up the client's calendar too. Without this, a
  // 10-session series cancellation would silently leave 9 events on her
  // Google Calendar with nothing pointing at them from our app.
  const futureRows = await db
    .select({
      id: sessions.id,
      googleEventId: sessions.googleEventId,
      googleRecurringEventId: sessions.googleRecurringEventId,
      recallBotId: sessions.recallBotId,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.accountId, accountId),
        eq(sessions.seriesId, seriesId),
        eq(sessions.status, "scheduled"),
        sql`${sessions.scheduledAt} > ${now.toISOString()}`
      )
    );

  // Call off any notetaker bots already sent for these occurrences. Without
  // this, cancelling a series left its bots queued in Recall — they'd join
  // the (deleted) Meet at each old session time for months. Best-effort and
  // sequential so a long series can't itself trip Recall's rate limit.
  for (const r of futureRows) {
    if (!r.recallBotId) continue;
    try {
      const { cancelBot } = await import("./recall");
      await cancelBot(r.recallBotId);
    } catch (e) {
      console.warn(
        `[cancelSessionSeries] couldn't cancel Recall bot ${r.recallBotId} for ${r.id}:`,
        e
      );
    }
  }

  // Best-effort clean up on Google. Don't block on failures — the DB delete
  // below is the source of truth. Deleting the ONE recurring event removes every
  // remaining occurrence at once; any occurrences that were individually
  // rescheduled into their own standalone events are deleted alongside it.
  // Deduped so the shared recurring id is deleted a single time.
  // What to do with the ONE recurring Google event. The series row is the
  // reliable handle (rows lose the id on cancel-one/reschedule-one; rows past
  // the window don't exist yet). If any occurrence of that event has already
  // HAPPENED, truncate the recurrence at "now" — that keeps her held sessions
  // on her Google Calendar and drops only the future ones. Deleting the master
  // would erase the past instances from Google too. Only a series with no held
  // instance yet gets its event deleted outright (nothing to preserve).
  const [seriesRow] = await db
    .select({ googleRecurringEventId: sessionSeries.googleRecurringEventId })
    .from(sessionSeries)
    .where(
      and(eq(sessionSeries.accountId, accountId), eq(sessionSeries.id, seriesId))
    )
    .limit(1);
  const recurringId =
    seriesRow?.googleRecurringEventId ??
    futureRows.find((r) => r.googleRecurringEventId)?.googleRecurringEventId ??
    null;

  // Detached occurrences (rescheduled into their own standalone events) are
  // deleted individually; the shared recurring id is handled once, below.
  const toDelete: { id: string; googleEventId: string }[] = [];
  const seenEventIds = new Set<string>();
  for (const r of futureRows) {
    if (r.googleRecurringEventId || !r.googleEventId) continue;
    if (seenEventIds.has(r.googleEventId)) continue;
    seenEventIds.add(r.googleEventId);
    toDelete.push({ id: r.id, googleEventId: r.googleEventId });
  }

  if (recurringId) {
    const [held] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.accountId, accountId),
          eq(sessions.seriesId, seriesId),
          eq(sessions.googleRecurringEventId, recurringId),
          sql`${sessions.scheduledAt} <= ${now.toISOString()}`
        )
      )
      .limit(1);
    if (held) {
      try {
        const { truncateRecurringEvent } = await import("./google-calendar");
        await truncateRecurringEvent(accountId, recurringId, now.getTime(), {
          notify: false,
        });
      } catch (e) {
        console.warn(
          "[cancelSessionSeries] truncating the recurring event failed (continuing with DB delete):",
          e
        );
      }
    } else {
      // `id` only serves to null googleEventId on a matching session row; when
      // no future row exists the series id matches none — harmless.
      toDelete.push({
        id: futureRows[0]?.id ?? seriesId,
        googleEventId: recurringId,
      });
    }
  }
  if (toDelete.length > 0) {
    try {
      const { deleteCalendarEventsForSessions } = await import(
        "./google-calendar"
      );
      // notify:false — one series-cancellation email is sent below; don't let
      // Google fire its own cancellation notices on top.
      await deleteCalendarEventsForSessions(accountId, toDelete, {
        notify: false,
      });
    } catch (e) {
      console.warn(
        "[cancelSessionSeries] Google cleanup failed (continuing with DB delete):",
        e
      );
    }
  }

  // Tell the client the recurring sessions are off — BEFORE we delete the rows
  // (the email reads the client + type off a session). One note for the whole
  // series, not one per occurrence.
  if (futureRows[0] && notifyClient) {
    await maybeSendCancellationEmail(accountId, futureRows[0].id, {
      series: true,
    });
  }

  // Delete the future scheduled sessions.
  await db.execute(
    sql`DELETE FROM sessions
        WHERE account_id = ${accountId}
        AND series_id = ${seriesId}
        AND status = 'scheduled'
        AND scheduled_at > ${now.toISOString()}`
  );

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/today");
}

export async function logPastSession(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client");
  const type = str(formData, "type") ?? "Session";
  const scheduledAtRaw = required(str(formData, "scheduledAt"), "Date / time");
  const durationMinutes = num(formData, "durationMinutes") ?? 60;
  const paid = bool(formData, "paid");

  const [created] = await db
    .insert(sessions)
    .values({
      accountId,
      clientId,
      type,
      status: "completed",
      scheduledAt: new Date(scheduledAtRaw),
      durationMinutes,
      intention: str(formData, "intention"),
      arrivedAs: str(formData, "arrivedAs"),
      leftAs: str(formData, "leftAs"),
      notes: str(formData, "notes"),
      paid,
      paymentMethod: paid ? paymentMethodValue(formData, "paymentMethod") : null,
      paymentAmountCents: paid ? amountCents(formData, "paymentAmount") : null,
      paidAt: paid ? new Date().toISOString().slice(0, 10) : null,
    })
    .returning();

  // Run auto-rules (creates follow-up task; auto-invoice if turned on)
  await runOnSessionCompleted(created.id, created.clientId);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/payments");
  revalidatePath("/today");
}

export async function updateSession(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "Session id");
  const clientId = required(str(formData, "clientId"), "Client id");

  // Read existing session to detect title/intention changes worth syncing
  const existingRows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)))
    .limit(1);
  const existing = existingRows[0];

  const newType = str(formData, "type");
  const newIntention = str(formData, "intention");

  const updates: Record<string, unknown> = {
    intention: newIntention,
    arrivedAs: str(formData, "arrivedAs"),
    leftAs: str(formData, "leftAs"),
    notes: str(formData, "notes"),
    type: newType ?? undefined,
    updatedAt: new Date(),
  };

  const isMarkComplete = str(formData, "markComplete") === "true";
  if (isMarkComplete) updates.status = "completed";

  await db
    .update(sessions)
    .set(updates)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)));

  // Push edited title/intention to Google (only if event exists and something
  // user-visible changed). Skip on completion — past events don't need sync.
  if (
    !isMarkComplete &&
    existing?.googleEventId &&
    (newType !== existing.type || newIntention !== existing.intention)
  ) {
    await syncSessionToGoogle(id);
  }

  if (isMarkComplete) {
    // Stamp what the session is worth, from her Settings default rate.
    //
    // Settings has said "Default rate — used when no amount is set on a
    // session" since the beginning, but only invoice generation ever read it.
    // Nothing wrote it onto the session, so payment_amount_cents stayed NULL
    // on every session ever completed: the Clients list showed $0 paid and $0
    // unpaid, the client's Billing tab showed nothing owed, and the portal's
    // card-pay button could never appear (it requires an amount > 0).
    //
    // Only fills a NULL — a session she priced by hand, or deliberately set to
    // 0 for a gifted session, is never overwritten.
    try {
      const settings = await getSettings(accountId);
      const rate = settings?.defaultRateCents ?? 0;
      if (rate > 0) {
        await db
          .update(sessions)
          .set({ paymentAmountCents: rate, updatedAt: new Date() })
          .where(
            and(
              eq(sessions.accountId, accountId),
              eq(sessions.id, id),
              isNull(sessions.paymentAmountCents)
            )
          );
      }
    } catch (err) {
      console.error("[complete] couldn't stamp the session amount:", err);
    }

    await runOnSessionCompleted(id, clientId);
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/today");
}

// Reschedule = change scheduledAt (and optionally durationMinutes). Pushes to Google.
export async function rescheduleSession(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "Session id");
  const clientId = required(str(formData, "clientId"), "Client id");
  const scheduledAtRaw = required(
    str(formData, "scheduledAt"),
    "Date / time"
  );
  const durationMinutes = num(formData, "durationMinutes");

  // Cancel the existing Recall bot (if any) before changing the time —
  // it's scheduled for the OLD time and Recall doesn't let us mutate
  // join_at once a bot exists. We re-schedule a fresh one below.
  const [pre] = await db
    .select({
      botId: sessions.recallBotId,
      googleRecurringEventId: sessions.googleRecurringEventId,
      scheduledAt: sessions.scheduledAt,
    })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)))
    .limit(1);
  if (pre?.botId) {
    // Don't swallow — if cancel fails (Recall returns 5xx), the bot is
    // still scheduled for the OLD time. If we proceeded silently we'd
    // also schedule a NEW bot below for the new time, leaving TWO bots
    // in play. Better to fail the reschedule loudly so the user retries
    // once Recall is back up. cancelBot internally treats 404 / "already
    // gone" responses as success and only throws on 5xx; so this only
    // fails when Recall is genuinely unreachable.
    const { cancelBot } = await import("./recall");
    await cancelBot(pre.botId);
  }

  const updates: Record<string, unknown> = {
    scheduledAt: new Date(scheduledAtRaw),
    updatedAt: new Date(),
    // Clear reminder bookkeeping so the moved session gets fresh reminders
    // for the new time.
    clientReminderSentAt: null,
    practitionerReminderSentAt: null,
    // Including the T-10 nudges — a session moved to a new time deserves a
    // fresh "we're starting" prompt, and without this the moved session would
    // silently never get one.
    walkInNudgeSentAt: null,
    clientWalkInNudgeSentAt: null,
    // Clear Recall bookkeeping so maybeAutoAddRecallBot below treats this
    // as a fresh schedule.
    recallBotId: null,
    recallBotStatus: null,
  };
  if (durationMinutes !== null) updates.durationMinutes = durationMinutes;
  // Moving ONE occurrence of a recurring series DETACHES it: it becomes its own
  // standalone Google event at the new time, so the rest of the series is
  // untouched. Drop the recurring link now; the standalone is created by the
  // sync below (googleEventId + googleRecurringEventId both null → it creates
  // a fresh event and emails the client the one moved invite).
  if (pre?.googleRecurringEventId) updates.googleRecurringEventId = null;

  await db
    .update(sessions)
    .set(updates)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)));

  // If this was a live series occurrence, cancel THAT occurrence on the shared
  // recurring event (silently — the standalone below carries the notice), so it
  // doesn't linger at the old time. Best-effort; the DB is the source of truth.
  if (pre?.googleRecurringEventId) {
    try {
      const { cancelRecurringInstance } = await import("./google-calendar");
      await cancelRecurringInstance(
        accountId,
        pre.googleRecurringEventId,
        pre.scheduledAt.getTime(),
        { notify: false }
      );
    } catch (err) {
      console.error("[rescheduleSession] detach from series failed:", err);
    }
  }

  // Push to Google. If event exists, this updates it (sends "rescheduled"
  // notification to the client). If it doesn't exist yet (including a just-
  // detached series occurrence), this creates a standalone event.
  await syncSessionToGoogle(id);

  // Schedule a fresh bot for the new time (Meet URL stays the same).
  await maybeAutoAddRecallBot(accountId, id);

  // Tell the client their session moved. Until now nothing here emailed them
  // at all — the only "rescheduled" notice they could receive came from Google
  // Calendar, so a client without a Google invite (in-person, or Google not
  // connected) simply never found out. Runs after the sync so it quotes the
  // final Meet link. Best-effort, like the booking confirmation.
  await maybeSendBookingConfirmation(accountId, id, true);

  // Moving the session ANSWERS any open "can we move this?" ask. Without
  // this the request stayed pending forever: her Loose Ends chip never
  // cleared, and the client's portal kept showing "you already sent a
  // request" with no form — locked out of ever asking again.
  await resolvePendingRescheduleRequests(accountId, id);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/today");
  revalidatePath("/requests");
  revalidatePath(`/portal/sessions/${id}`);
}

/** Close out any open reschedule request on a session — used when she
 *  reschedules or cancels it, since either action settles the question. */
async function resolvePendingRescheduleRequests(
  accountId: string,
  sessionId: string
): Promise<void> {
  try {
    const { rescheduleRequests } = await import("@/db/schema");
    await db
      .update(rescheduleRequests)
      .set({ status: "resolved", reviewedAt: new Date() })
      .where(
        and(
          eq(rescheduleRequests.accountId, accountId),
          eq(rescheduleRequests.sessionId, sessionId),
          eq(rescheduleRequests.status, "pending")
        )
      );
  } catch (err) {
    // Never let bookkeeping break the reschedule itself.
    console.error("[reschedule] couldn't resolve pending requests:", err);
  }
}

export async function cancelSession(
  sessionId: string,
  clientId: string,
  /** notifyClient:false = quiet cancel — no app email, and Google deletes
   *  the event without its own cancellation notice. Default: notify. */
  opts: { notifyClient?: boolean } = {}
) {
  const notifyClient = opts.notifyClient !== false;
  const { accountId } = await requireSession();
  // Look up before update to grab the Google event id + Recall bot id
  const existingRows = await db
    .select({
      googleEventId: sessions.googleEventId,
      googleRecurringEventId: sessions.googleRecurringEventId,
      scheduledAt: sessions.scheduledAt,
      recallBotId: sessions.recallBotId,
    })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
    .limit(1);

  // Cancel the Recall bot so it doesn't pointlessly join a cancelled meeting.
  // Same discipline as rescheduleSession: cancelBot treats "bot already
  // gone" as success and only throws on Recall 5xx. If Recall is truly
  // down we'd rather surface that to the user than silently leave a
  // Notetaker bot to dial into a cancelled session (and confuse the
  // client when it appears in their otherwise-empty Meet).
  if (existingRows[0]?.recallBotId) {
    const { cancelBot } = await import("./recall");
    await cancelBot(existingRows[0].recallBotId);
  }

  await db
    .update(sessions)
    .set({
      status: "cancelled",
      recallBotId: null,
      recallBotStatus: null,
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));

  // Remove it from Google. A live series occurrence is an instance of the ONE
  // recurring event — cancel just THAT occurrence (silently; the app emails its
  // own cancellation below), leaving the rest of the series intact. A standalone
  // session deletes its own event as before.
  if (existingRows[0]?.googleRecurringEventId) {
    try {
      const { cancelRecurringInstance } = await import("./google-calendar");
      await cancelRecurringInstance(
        accountId,
        existingRows[0].googleRecurringEventId,
        existingRows[0].scheduledAt.getTime(),
        { notify: false }
      );
    } catch (err) {
      console.error("[cancelSession] cancel series occurrence failed:", err);
    }
    await db
      .update(sessions)
      .set({ googleRecurringEventId: null })
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      );
  } else {
    await deleteSessionFromGoogle(
      accountId,
      existingRows[0]?.googleEventId ?? null,
      { notify: notifyClient }
    );
    if (existingRows[0]?.googleEventId) {
      await db
        .update(sessions)
        .set({ googleEventId: null })
        .where(
          and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
        );
    }
  }

  // Cancelling also settles any open "can we move this?" ask.
  await resolvePendingRescheduleRequests(accountId, sessionId);

  // Email the client that it's off. Google only notifies calendar invitees, so
  // an in-person or no-Google client would otherwise never hear. Skipped when
  // she unticked "email the client" (test bookings, duplicates, a client who
  // already knows).
  if (notifyClient) {
    await maybeSendCancellationEmail(accountId, sessionId, { series: false });
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/today");
  revalidatePath("/requests");
  revalidatePath(`/portal/sessions/${sessionId}`);
}

/** Best-effort: email the client that a session (or the whole recurring series)
 *  was cancelled. Independent of Google Calendar, so a no-Google/in-person
 *  client still hears. Never throws — a mail hiccup must not fail the cancel. */
async function maybeSendCancellationEmail(
  accountId: string,
  sessionId: string,
  opts: { series?: boolean } = {}
): Promise<void> {
  try {
    const { isResendConfigured, sendSessionCancelledEmail } = await import(
      "./resend"
    );
    if (!isResendConfigured()) return;
    const [row] = await db
      .select({
        clientName: clients.fullName,
        clientEmail: clients.email,
        clientTimezone: clients.timezone,
        scheduledAt: sessions.scheduledAt,
        sessionType: sessions.type,
        sessionTimezone: sessions.timezone,
        practitionerName: practitionerSettings.practitionerName,
        businessEmail: practitionerSettings.businessEmail,
        practiceTimezone: practitionerSettings.timezone,
      })
      .from(sessions)
      .innerJoin(clients, eq(clients.id, sessions.clientId))
      .leftJoin(
        practitionerSettings,
        eq(practitionerSettings.accountId, sessions.accountId)
      )
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
      .limit(1);
    if (!row?.clientEmail) return;
    const clientZone = resolveTimeZone(
      row.clientTimezone,
      row.sessionTimezone,
      row.practiceTimezone
    );
    await sendSessionCancelledEmail({
      to: row.clientEmail,
      clientName: row.clientName,
      sessionType: row.sessionType,
      scheduledAt: new Date(row.scheduledAt),
      practitionerName: row.practitionerName ?? null,
      replyTo: row.businessEmail ?? undefined,
      timeZone: clientZone,
      series: opts.series === true,
    });
  } catch (err) {
    console.warn("[cancellation email] failed:", err);
  }
}

export async function deleteSession(sessionId: string, clientId: string) {
  const { accountId } = await requireSession();
  // Gather Google + Blob refs before deleting so we can clean up after.
  const [existing] = await db
    .select({
      googleEventId: sessions.googleEventId,
      googleRecurringEventId: sessions.googleRecurringEventId,
      scheduledAt: sessions.scheduledAt,
      invoiceUrl: sessions.invoiceUrl,
    })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
    .limit(1);

  // Session-scoped attachments (uploaded with this session). Client-scoped
  // attachments without a sessionId are kept — they belong to the client
  // file, not the session.
  const sessionAttachments = await db
    .select({ url: attachments.url })
    .from(attachments)
    .where(
      and(
        eq(attachments.accountId, accountId),
        eq(attachments.sessionId, sessionId)
      )
    );

  await db
    .delete(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));
  // Remove it from Google. A live series occurrence is an instance of the shared
  // recurring event — cancel just that occurrence (silently); a standalone
  // deletes its own event. Without this, deleting one occurrence of a synced
  // series left a ghost on the client's + practitioner's calendars.
  if (existing?.googleRecurringEventId) {
    try {
      const { cancelRecurringInstance } = await import("./google-calendar");
      await cancelRecurringInstance(
        accountId,
        existing.googleRecurringEventId,
        existing.scheduledAt.getTime(),
        { notify: false }
      );
    } catch (err) {
      console.error("[deleteSession] cancel series occurrence failed:", err);
    }
  } else {
    await deleteSessionFromGoogle(accountId, existing?.googleEventId ?? null);
  }

  // Best-effort Blob cleanup. The DB cascade already deleted the attachment
  // rows; here we tidy up the files those rows pointed at.
  const blobUrls = [
    ...(existing?.invoiceUrl ? [existing.invoiceUrl] : []),
    ...sessionAttachments.map((a) => a.url).filter((u): u is string => !!u),
  ];
  if (blobUrls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { del } = await import("@vercel/blob");
      await del(blobUrls);
    } catch (e) {
      console.warn("[deleteSession] Blob delete failed:", e);
    }
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/payments");
  revalidatePath("/today");
}

export async function markSessionPaid(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "Session id");
  const clientId = required(str(formData, "clientId"), "Client id");

  // "This one's on me" — a gift / comp. Recorded as gifted (paid=false, amount
  // 0) so it drops out of the unpaid nags + revenue totals without being faked
  // as a real payment. Mirrors gifted Circle seats.
  if (bool(formData, "noCharge")) {
    await db
      .update(sessions)
      .set({
        paid: false,
        paymentMethod: "gifted",
        paymentAmountCents: 0,
        paymentNote: str(formData, "paymentNote"),
        paidAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)));
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/payments");
    revalidatePath("/today");
    return;
  }

  const method = paymentMethodValue(formData, "paymentMethod") ?? "other";
  const amount = amountCents(formData, "paymentAmount");
  const note = str(formData, "paymentNote");

  await db
    .update(sessions)
    .set({
      paid: true,
      paymentMethod: method,
      // Leave the amount alone when the box comes back empty. It used to
      // write NULL, which silently erased whatever the session was worth —
      // including the amount stamped at completion.
      ...(amount !== null ? { paymentAmountCents: amount } : {}),
      paymentNote: note,
      paidAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)));

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
  revalidatePath("/today");
}

export async function markSessionUnpaid(sessionId: string, clientId: string) {
  const { accountId } = await requireSession();
  await db
    .update(sessions)
    .set({
      paid: false,
      paymentMethod: null,
      paymentAmountCents: null,
      paymentNote: null,
      paidAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
    );
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
}

// ─────────────────────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────────────────────

export async function addGoal(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const label = required(str(formData, "label"), "Goal label");
  const progress = Math.max(0, Math.min(100, num(formData, "progress") ?? 0));
  const note = str(formData, "note");

  await db
    .insert(goals)
    .values({ accountId, clientId, label, progress, note });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateGoalProgress(
  goalId: string,
  clientId: string,
  progress: number
) {
  const { accountId } = await requireSession();
  const clamped = Math.max(0, Math.min(100, progress));
  await db
    .update(goals)
    .set({ progress: clamped, updatedAt: new Date() })
    .where(and(eq(goals.accountId, accountId), eq(goals.id, goalId)));
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteGoal(goalId: string, clientId: string) {
  const { accountId } = await requireSession();
  await db
    .delete(goals)
    .where(and(eq(goals.accountId, accountId), eq(goals.id, goalId)));
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────

export async function addTask(formData: FormData) {
  const { accountId } = await requireSession();
  const title = required(str(formData, "title"), "Task title");
  const clientId = str(formData, "clientId"); // optional
  const dueAtRaw = str(formData, "dueAt");
  const body = str(formData, "body");

  await db.insert(tasks).values({
    accountId,
    title,
    body,
    clientId,
    dueAt: dueAtRaw ? new Date(dueAtRaw) : null,
  });

  revalidatePath("/today");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function toggleTaskComplete(
  taskId: string,
  clientId: string | null
) {
  const { accountId } = await requireSession();
  const [t] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.accountId, accountId), eq(tasks.id, taskId)))
    .limit(1);
  if (!t) return;
  await db
    .update(tasks)
    .set({
      completedAt: t.completedAt ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.accountId, accountId), eq(tasks.id, taskId)));
  revalidatePath("/today");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function deleteTask(taskId: string, clientId: string | null) {
  const { accountId } = await requireSession();
  await db
    .delete(tasks)
    .where(and(eq(tasks.accountId, accountId), eq(tasks.id, taskId)));
  revalidatePath("/today");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNICATIONS — log emails / calls / messages
// ─────────────────────────────────────────────────────────────────────────────

export async function logCommunication(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const kind =
    (str(formData, "kind") as
      | "email_sent"
      | "email_received"
      | "call_logged"
      | "sms_sent"
      | "note"
      | null) ?? "note";
  const subject = str(formData, "subject");
  const body = str(formData, "body");
  const templateId = str(formData, "templateId");

  await db.insert(communications).values({
    accountId,
    clientId,
    kind,
    subject,
    body,
    templateId: templateId ?? null,
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteCommunication(
  commId: string,
  clientId: string
) {
  const { accountId } = await requireSession();
  await db
    .delete(communications)
    .where(
      and(
        eq(communications.accountId, accountId),
        eq(communications.id, commId)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND EMAIL — actually send via Resend + log it on the client.
// Returns { ok: true } on success or { ok: false, message } on failure.
// EmailComposer falls back to mailto: if Resend isn't configured.
// ─────────────────────────────────────────────────────────────────────────────

export type SendEmailResult = { ok: true } | { ok: false; message: string };

export async function sendClientEmail(formData: FormData): Promise<SendEmailResult> {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const to = required(str(formData, "to"), "Recipient");
  const subject = required(str(formData, "subject"), "Subject");
  const body = required(str(formData, "body"), "Body");
  const templateId = str(formData, "templateId");

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      message: "Email sending isn't configured. Set RESEND_API_KEY to enable real send.",
    };
  }

  // Lazy-import so this action stays cheap when Resend isn't used.
  const { sendEmail } = await import("./resend");
  const settings = await getSettings(accountId);

  // Wrap plain-text body in a minimal HTML email so it renders cleanly.
  const html = bodyToHtml(body, settings?.businessName ?? null);

  try {
    await sendEmail({
      to,
      subject,
      html,
      text: body,
      replyTo: settings?.businessEmail ?? undefined,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Resend rejected the message.";
    return { ok: false, message };
  }

  // Log it on the client's profile.
  await db.insert(communications).values({
    accountId,
    clientId,
    kind: "email_sent",
    subject,
    body,
    templateId: templateId ?? null,
  });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

function bodyToHtml(body: string, businessName: string | null): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const signature = businessName
    ? `<p style="margin:24px 0 0 0;color:#9a9a9a;font-size:11px;">Sent via ${businessName}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;font-size:14px;line-height:1.55;max-width:560px;margin:24px auto;padding:0 16px;">${paragraphs}${signature}</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILES (deletion)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteAttachment(
  attachmentId: string,
  clientId: string
) {
  const { accountId } = await requireSession();
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { del } = await import("@vercel/blob");
      const [row] = await db
        .select({ url: attachments.url })
        .from(attachments)
        .where(
          and(
            eq(attachments.accountId, accountId),
            eq(attachments.id, attachmentId)
          )
        )
        .limit(1);
      if (row?.url) await del(row.url);
    }
  } catch (e) {
    console.warn("Blob delete failed (continuing with DB delete):", e);
  }
  await db
    .delete(attachments)
    .where(
      and(
        eq(attachments.accountId, accountId),
        eq(attachments.id, attachmentId)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export async function updateSettings(formData: FormData) {
  const { accountId } = await requireSession();
  const settings = await getSettings(accountId);

  const defaultRate = num(formData, "defaultRate");

  // Validate uiLanguage against our known locale list — accept "en"/"ru"/"uk",
  // fall back to existing value (or "en") on anything else.
  const submittedLang = str(formData, "uiLanguage");
  const uiLanguage =
    submittedLang === "en" ||
    submittedLang === "ru" ||
    submittedLang === "uk"
      ? submittedLang
      : settings.uiLanguage ?? "en";

  // Practice home timezone — validate as a real IANA zone; keep the existing
  // value on anything unusable (never clobber a good zone with junk).
  const submittedTz = str(formData, "timezone");
  const timezone = isValidTimeZone(submittedTz)
    ? submittedTz
    : settings.timezone ?? null;

  await db
    .update(practitionerSettings)
    .set({
      timezone,
      practitionerName: str(formData, "practitionerName"),
      businessName: str(formData, "businessName"),
      businessEmail: str(formData, "businessEmail"),
      businessPhone: str(formData, "businessPhone"),
      businessAddress: str(formData, "businessAddress"),
      websiteUrl: str(formData, "websiteUrl"),
      // NOTE: landingCopyOverrides is deliberately NOT written here. The
      // storefront's words moved out of this form and into per-section dialogs
      // (Settings → Landing page), each saved by saveSectionCopy. Rebuilding
      // the blob from this form would now find none of those fields present
      // and wipe every word she's written.
      uiLanguage,
      // Clamp rather than throw — a settings save shouldn't fail on a stray
      // value, but a negative/absurd default rate would flow into every
      // session's stamped amount and the revenue totals.
      defaultRateCents:
        defaultRate !== null
          ? Math.min(MAX_AMOUNT_CENTS, Math.max(0, Math.round(defaultRate * 100)))
          : 13500,
      // Whitelisted on write: this is a free-text input, and anything that
      // isn't a valid ISO code makes Intl.NumberFormat throw on every page
      // that prints a price — including her client's billing page.
      defaultCurrency: safeCurrency(str(formData, "defaultCurrency")),
      paymentInstructions: str(formData, "paymentInstructions"),
      invoiceFooter: str(formData, "invoiceFooter"),
      invoicePrefix: str(formData, "invoicePrefix") ?? "INV",
      autoInvoiceOnComplete: bool(formData, "autoInvoiceOnComplete"),
      autoUploadAiNotes: bool(formData, "autoUploadAiNotes"),
      recallEnabled: bool(formData, "recallEnabled"),
      recallAutoAdd: bool(formData, "recallAutoAdd"),
      recallBotName: str(formData, "recallBotName") ?? "Notetaker",
      clientReminderHours: clampHours(
        num(formData, "clientReminderHours") ?? 24
      ),
      practitionerReminderHours: clampHours(
        num(formData, "practitionerReminderHours") ?? 1
      ),
      // Sabbath days — comma-separated lowercase ISO weekday names from the
      // form's hidden field (the day-toggle picker UI maintains it).
      // Filter to known values so a junk submission can't poison the array.
      sabbathDays: parseSabbathDays(str(formData, "sabbathDays")),
      // Availability config — drives smart scheduling + the public
      // "available windows" hint on the storefront inquiry form. Parse
      // the form's hidden workingHours JSON; rejects junk silently
      // (falling back to existing value).
      workingHours: parseWorkingHours(
        str(formData, "workingHours"),
        settings.workingHours as Record<string, unknown> | null
      ),
      bufferMinutes: clampInt(num(formData, "bufferMinutes"), 0, 240, 15),
      defaultSessionMinutes: clampInt(
        num(formData, "defaultSessionMinutes"),
        5,
        480,
        60
      ),
      showAvailabilityPublicly: bool(formData, "showAvailabilityPublicly"),
      circleRoomUrl: str(formData, "circleRoomUrl"),
      circleSignupsOpen: bool(formData, "circleSignupsOpen"),
      landingPortraitUrl: str(formData, "landingPortraitUrl"),
      logoUrl: str(formData, "logoUrl"),
      faviconUrl: str(formData, "faviconUrl"),
      updatedAt: new Date(),
    })
    .where(eq(practitionerSettings.accountId, accountId));

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/"); // landing page reads from settings — keep it fresh
}

const VALID_WEEKDAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

function parseSabbathDays(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter((d) => VALID_WEEKDAYS.has(d))
    )
  );
}

/** Parse a JSON working-hours blob from the Availability settings form.
 *  Returns a sanitized {day: {from, to}} object, or the previous value
 *  if parsing fails (defensive against form tampering). */
function parseWorkingHours(
  raw: string | null,
  fallback: Record<string, unknown> | null
): Record<string, { from: string; to: string } | null> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const validDays = new Set(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
    const out: Record<string, { from: string; to: string } | null> = {};
    for (const day of Object.keys(parsed)) {
      if (!validDays.has(day)) continue;
      const v = parsed[day] as { from?: string; to?: string } | null;
      if (!v || typeof v !== "object") {
        out[day] = null;
        continue;
      }
      const from = typeof v.from === "string" ? v.from : null;
      const to = typeof v.to === "string" ? v.to : null;
      if (from && to && /^\d{2}:\d{2}$/.test(from) && /^\d{2}:\d{2}$/.test(to)) {
        out[day] = { from, to };
      } else {
        out[day] = null;
      }
    }
    return out;
  } catch {
    return (fallback ?? null) as Record<
      string,
      { from: string; to: string } | null
    > | null;
  }
}

/** Clamp a nullable number to a range with a sensible default. */
function clampInt(
  v: number | null,
  min: number,
  max: number,
  def: number
): number {
  if (v === null || !Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, Math.round(v)));
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export async function createEmailTemplate(formData: FormData) {
  const { accountId } = await requireSession();
  await db.insert(emailTemplates).values({
    accountId,
    name: required(str(formData, "name"), "Name"),
    subject: required(str(formData, "subject"), "Subject"),
    body: required(str(formData, "body"), "Body"),
    language: locale(formData, "language") ?? "en",
  });
  revalidatePath("/settings");
}

export async function updateEmailTemplate(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "id");
  await db
    .update(emailTemplates)
    .set({
      name: required(str(formData, "name"), "Name"),
      subject: required(str(formData, "subject"), "Subject"),
      body: required(str(formData, "body"), "Body"),
      language: locale(formData, "language") ?? "en",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailTemplates.accountId, accountId),
        eq(emailTemplates.id, id)
      )
    );
  revalidatePath("/settings");
}

export async function deleteEmailTemplate(id: string) {
  const { accountId } = await requireSession();
  await db
    .delete(emailTemplates)
    .where(
      and(
        eq(emailTemplates.accountId, accountId),
        eq(emailTemplates.id, id)
      )
    );
  revalidatePath("/settings");
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE TEMPLATES (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export async function createNoteTemplate(formData: FormData) {
  const { accountId } = await requireSession();
  await db.insert(noteTemplates).values({
    accountId,
    name: required(str(formData, "name"), "Name"),
    body: required(str(formData, "body"), "Body"),
  });
  revalidatePath("/settings");
}

export async function updateNoteTemplate(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "id");
  await db
    .update(noteTemplates)
    .set({
      name: required(str(formData, "name"), "Name"),
      body: required(str(formData, "body"), "Body"),
      updatedAt: new Date(),
    })
    .where(
      and(eq(noteTemplates.accountId, accountId), eq(noteTemplates.id, id))
    );
  revalidatePath("/settings");
}

export async function deleteNoteTemplate(id: string) {
  const { accountId } = await requireSession();
  await db
    .delete(noteTemplates)
    .where(
      and(eq(noteTemplates.accountId, accountId), eq(noteTemplates.id, id))
    );
  revalidatePath("/settings");
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-RULES — runs when a session is marked complete
// ─────────────────────────────────────────────────────────────────────────────

async function runOnSessionCompleted(sessionId: string, _clientId: string) {
  // requireSession is already called by the parent action (logPastSession /
  // updateSession), so calling it again here uses the React `cache()` and
  // doesn't re-decrypt the JWT.
  const { accountId } = await requireSession();
  const settings = await getSettings(accountId);

  if (settings.autoInvoiceOnComplete) {
    try {
      const { generateInvoiceForSession } = await import("./invoices");
      await generateInvoiceForSession(sessionId);
    } catch (e) {
      console.warn("Auto-invoice generation failed:", e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT PEOPLE
// ─────────────────────────────────────────────────────────────────────────────

export async function addImportantPerson(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const name = required(str(formData, "name"), "Name");
  const relationship = required(str(formData, "relationship"), "Relationship");
  const notes = str(formData, "notes");
  const isAlive = !bool(formData, "deceased");

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(importantPeople)
    .where(
      and(
        eq(importantPeople.accountId, accountId),
        eq(importantPeople.clientId, clientId)
      )
    );

  await db.insert(importantPeople).values({
    accountId,
    clientId,
    name,
    relationship,
    notes,
    isAlive,
    position: count,
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateImportantPerson(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "id");
  const clientId = required(str(formData, "clientId"), "Client id");

  await db
    .update(importantPeople)
    .set({
      name: required(str(formData, "name"), "Name"),
      relationship: required(str(formData, "relationship"), "Relationship"),
      notes: str(formData, "notes"),
      isAlive: !bool(formData, "deceased"),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(importantPeople.accountId, accountId),
        eq(importantPeople.id, id)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteImportantPerson(
  personId: string,
  clientId: string
) {
  const { accountId } = await requireSession();
  await db
    .delete(importantPeople)
    .where(
      and(
        eq(importantPeople.accountId, accountId),
        eq(importantPeople.id, personId)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// THEMES
// ─────────────────────────────────────────────────────────────────────────────

export async function addTheme(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const label = required(str(formData, "label"), "Theme");
  await db.insert(themes).values({ accountId, clientId, label });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteTheme(themeId: string, clientId: string) {
  const { accountId } = await requireSession();
  await db
    .delete(themes)
    .where(and(eq(themes.accountId, accountId), eq(themes.id, themeId)));
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// OBSERVATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function addObservation(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const body = required(str(formData, "body"), "Observation");
  await db.insert(observations).values({ accountId, clientId, body });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteObservation(observationId: string, clientId: string) {
  const { accountId } = await requireSession();
  await db
    .delete(observations)
    .where(
      and(
        eq(observations.accountId, accountId),
        eq(observations.id, observationId)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE CALENDAR — connect / disconnect
// ─────────────────────────────────────────────────────────────────────────────

export async function startGoogleConnect() {
  const { accountId } = await requireSession();
  const { getGoogleAuthUrl } = await import("./google-calendar");

  // Set an ITP-safe state cookie BEFORE redirecting to Google. Safari's
  // Intelligent Tracking Prevention can sometimes strip the main session
  // cookie when the request flows through a cross-site redirect chain
  // (accounts.google.com → us). When that happens, the OAuth callback finds
  // `requireSession()` returns no email and bounces to /signin, even though
  // the user completed the OAuth grant. This first-party, path-scoped cookie
  // is short-lived and same-site=lax, so ITP leaves it alone. The callback
  // checks it before falling back to the session cookie.
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.set("gcal_oauth_state", accountId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/api/auth/google/callback",
    secure: process.env.NODE_ENV === "production",
  });

  const url = getGoogleAuthUrl();
  redirect(url);
}

export async function disconnectGoogleAction() {
  const { accountId } = await requireSession();
  const { disconnectGoogle } = await import("./google-calendar");
  await disconnectGoogle(accountId);
  revalidatePath("/settings");
}

/** Diagnostic: create a probe Google Calendar event, immediately delete it,
 *  and return either success or the actual Google error message. Lets the
 *  practitioner figure out why sync is failing without us needing to dig
 *  into Vercel logs. */
export type TestGoogleResult =
  | { ok: true; meetUrl: string | null; htmlLink: string | null }
  | { ok: false; error: string };

export async function testGoogleConnectionAction(): Promise<TestGoogleResult> {
  const { accountId } = await requireSession();
  const { createCalendarEvent, deleteCalendarEvent } = await import(
    "./google-calendar"
  );

  try {
    // Place the probe an hour in the future so it doesn't show up at "now"
    // even if cleanup somehow fails.
    const startAt = new Date(Date.now() + 60 * 60 * 1000);
    const result = await createCalendarEvent(accountId, {
      summary: "[Soul Service probe — safe to delete]",
      description:
        "Diagnostic event from the Status page. We're deleting it immediately. If you see this on your calendar, please dismiss — it means cleanup didn't fire.\n\nCreated by Soul Service",
      startAt,
      durationMinutes: 5,
      attendeeEmail: null,
      practitionerEmail: null,
    });

    if (!result) {
      return {
        ok: false,
        error:
          "Google isn't connected for this account, or the refresh token is gone. Try disconnect + reconnect in Settings.",
      };
    }

    // Best-effort cleanup. If delete fails she'll see the probe event briefly
    // — annoying but not destructive.
    try {
      await deleteCalendarEvent(accountId, result.eventId);
    } catch (e) {
      console.warn("[testGoogleConnection] probe cleanup failed:", e);
    }

    // The probe just succeeded, so the connection is healthy right now. Clear
    // any stale error so /status stops showing a red banner for a problem
    // that's already fixed. (This is exactly what confused us: a passing test
    // sitting under a six-day-old error message.)
    await db
      .update(practitionerSettings)
      .set({
        googleLastError: null,
        googleLastErrorAt: null,
        updatedAt: new Date(),
      })
      .where(eq(practitionerSettings.accountId, accountId));

    return {
      ok: true,
      meetUrl: result.meetUrl,
      htmlLink: result.htmlLink,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/** Public sync-one action — push a specific session to Google Calendar on
 *  demand. Used by the "Push to Google Calendar" button on session cards so
 *  she can backfill sessions that were saved while Google was broken (or
 *  retry after fixing the connection). Self-heals 404/410 inside
 *  syncSessionToGoogle's existing flow. Account-scoped: only her own
 *  sessions are touchable. */
export type SyncSessionResult =
  | { ok: true; meetUrl: string | null }
  | { ok: false; error: string };

export async function syncSessionToGoogleAction(
  sessionId: string
): Promise<SyncSessionResult> {
  const { accountId } = await requireSession();
  // Re-verify the session belongs to the calling account.
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
    .limit(1);
  if (!row) {
    return { ok: false, error: "Session not found in your account." };
  }
  const result = await syncSessionToGoogle(sessionId);
  if (!result.ok) return result;
  revalidatePath("/today");
  revalidatePath("/calendar");
  return { ok: true, meetUrl: result.meetUrl ?? null };
}

/** Bulk catch-up — finds her unsynced sessions and pushes each to Google
 *  Calendar in sequence. Rate-limited to ~6 per second (well under Google's
 *  600 req/min/user quota). Capped at MAX per call so a single click fits
 *  inside Vercel's function timeout; for bigger backlogs she clicks again
 *  and the response tells her how many remain.
 *
 *  Past + future, in chronological order — past first so when she scrolls
 *  back through her Google calendar today she sees history landing as it
 *  catches up. */
const SYNC_BATCH_MAX = 25;

export type SyncAllResult = {
  synced: number;
  failed: number;
  remaining: number;
  firstError: string | null;
};

export async function syncAllUnsyncedToGoogleAction(): Promise<SyncAllResult> {
  const { accountId } = await requireSession();

  // Find unsynced sessions for this account. We intentionally include past
  // sessions — practitioners go back to look up "what did we do last
  // Tuesday" on their phone calendar, so the history matters too. Skip
  // cancelled (those wouldn't belong on Google anyway).
  const unsynced = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.accountId, accountId),
        isNull(sessions.googleEventId),
        // exclude cancelled — they shouldn't appear on her calendar at all
        sql`${sessions.status} <> 'cancelled'`
      )
    )
    .orderBy(sessions.scheduledAt);

  if (unsynced.length === 0) {
    return { synced: 0, failed: 0, remaining: 0, firstError: null };
  }

  const batch = unsynced.slice(0, SYNC_BATCH_MAX);
  const remaining = Math.max(0, unsynced.length - batch.length);

  let synced = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const row of batch) {
    const result = await syncSessionToGoogle(row.id);
    if (result.ok) {
      synced++;
    } else {
      failed++;
      if (firstError === null) firstError = result.error;
    }
    // ~150ms between calls keeps us comfortably under the 600/min quota.
    await new Promise((r) => setTimeout(r, 150));
  }

  if (synced > 0) {
    revalidatePath("/today");
    revalidatePath("/calendar");
    revalidatePath("/status");
  }

  return { synced, failed, remaining, firstError };
}

// Internal helper — best-effort Google Calendar push for a session.
// Never throws; any Google failure is logged + returned as an error string.
// Currently disabled in UI ("coming soon") but the code still runs if creds
// happen to be configured — it's a no-op when they aren't.
/** Create ONE recurring Google event for a whole series, built from its first
 *  future session (loads client + settings like syncSessionToGoogle). Returns
 *  the recurring event id + the shared Meet link, or null (not connected / no
 *  usable data — the series then stays app-only). Never throws. */
async function syncSeriesToGoogle(
  firstSessionId: string,
  recurrence: string
): Promise<{ recurringEventId: string; meetUrl: string | null } | null> {
  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, firstSessionId))
      .limit(1);
    if (!session) return null;
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, session.clientId))
      .limit(1);
    if (!client) return null;
    const [settings] = await db
      .select()
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, session.accountId))
      .limit(1);

    const { createRecurringCalendarEvent } = await import("./google-calendar");
    const result = await createRecurringCalendarEvent(
      session.accountId,
      {
        summary: `${session.type} · ${client.fullName}`,
        description: [
          session.intention ? `Intention: "${session.intention}"` : null,
          client.workingOn ? `Working on: ${client.workingOn}` : null,
          "—",
          "Recurring series created by Soul Service",
        ]
          .filter(Boolean)
          .join("\n"),
        startAt: session.scheduledAt,
        durationMinutes: session.durationMinutes,
        timeZone: resolveTimeZone(session.timezone, settings?.timezone),
        attendeeEmail: client.email,
        practitionerEmail: settings?.googleCalendarEmail ?? null,
        // One invite email to the client for the whole series, not per session.
        notify: true,
      },
      recurrence
    );
    if (!result) return null;
    return { recurringEventId: result.eventId, meetUrl: result.meetUrl };
  } catch (err) {
    console.error("[syncSeriesToGoogle] failed:", err);
    return null;
  }
}

async function syncSessionToGoogle(
  sessionId: string,
  opts?: { notify?: boolean }
): Promise<{ ok: true; meetUrl?: string | null } | { ok: false; error: string }> {
  try {
    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    const session = sessionRows[0];
    if (!session) return { ok: false, error: "Session not found" };

    // A live recurring-series occurrence is managed as an instance of its ONE
    // recurring event, never as a standalone. Standard sync (create/update)
    // would spawn a duplicate standalone event and its own "new event" email —
    // or, worse, patch the whole recurring event. Skip: the series/reschedule/
    // cancel paths handle these. (A session drops this link the moment it's
    // individually rescheduled, after which standard sync applies again.)
    if (session.googleRecurringEventId) {
      return { ok: true, meetUrl: session.meetUrl };
    }

    const clientRows = await db
      .select()
      .from(clients)
      .where(eq(clients.id, session.clientId))
      .limit(1);
    const client = clientRows[0];
    if (!client) return { ok: false, error: "Client not found" };

    const settingsRows = await db
      .select()
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, session.accountId))
      .limit(1);
    const settings = settingsRows[0];

    const eventInput = {
      summary: `${session.type} · ${client.fullName}`,
      description: [
        session.intention ? `Intention: "${session.intention}"` : null,
        client.workingOn ? `Working on: ${client.workingOn}` : null,
        "—",
        "Created by Soul Service",
      ]
        .filter(Boolean)
        .join("\n"),
      startAt: session.scheduledAt,
      durationMinutes: session.durationMinutes,
      // Pin the event's display zone to the session's zone (falling back to the
      // practice zone), so Google never renders it in the calendar's default.
      timeZone: resolveTimeZone(session.timezone, settings?.timezone),
      attendeeEmail: client.email,
      practitionerEmail: settings?.googleCalendarEmail ?? null,
      // Default to notifying (single bookings/reschedules email the client as
      // before); a bulk caller like a series passes notify:false to avoid a
      // flood of per-occurrence Google invite emails.
      notify: opts?.notify ?? true,
    };

    const {
      createCalendarEvent,
      updateCalendarEvent,
    } = await import("./google-calendar");

    let result;
    let didCreate = false; // tracks whether we just CREATED (vs updated)
    if (session.googleEventId) {
      result = await updateCalendarEvent(
        session.accountId,
        session.googleEventId,
        eventInput
      );
      // If event was deleted on Google's side (returns null), recreate it
      if (!result) {
        result = await createCalendarEvent(session.accountId, eventInput);
        didCreate = !!result;
      }
    } else {
      result = await createCalendarEvent(session.accountId, eventInput);
      didCreate = !!result;
    }

    if (!result) return { ok: true }; // Not connected — silent no-op

    if (didCreate) {
      // Conditional write per the GCal playbook (lesson 4): if a concurrent
      // call (e.g. two server actions racing on the same session) created
      // another event in between, its eventId is already on the row. Don't
      // overwrite — that would orphan the first event with nothing pointing
      // at it. The `isNull` guard means only the first writer wins.
      const updated = await db
        .update(sessions)
        .set({
          googleEventId: result.eventId,
          meetUrl: result.meetUrl ?? session.meetUrl,
          updatedAt: new Date(),
        })
        .where(
          and(eq(sessions.id, sessionId), isNull(sessions.googleEventId))
        )
        .returning({ id: sessions.id });

      if (updated.length === 0) {
        // Someone beat us to it. Delete OUR newly-created event so the row
        // ends up pointing at exactly one calendar event.
        try {
          const { deleteCalendarEvent } = await import("./google-calendar");
          await deleteCalendarEvent(session.accountId, result.eventId);
        } catch (e) {
          console.warn(
            "[syncSessionToGoogle] couldn't delete orphan event after race:",
            e
          );
        }
      }
    } else {
      // We updated an existing event — just store the (possibly refreshed)
      // Meet link. No race risk here because we're not creating a new event.
      await db
        .update(sessions)
        .set({
          meetUrl: result.meetUrl ?? session.meetUrl,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));
    }

    // Success — clear any stale error on the settings row so the Status
    // page stops shouting about a problem that's been fixed.
    await db
      .update(practitionerSettings)
      .set({
        googleLastError: null,
        googleLastErrorAt: null,
        updatedAt: new Date(),
      })
      .where(eq(practitionerSettings.accountId, session.accountId));

    return { ok: true, meetUrl: result.meetUrl };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Sync failed";
    console.warn("Google Calendar sync failed:", err);
    await reportError(err, { where: "syncSessionToGoogle", sessionId });
    // Persist the error on the settings row so /status can surface it later.
    // Best-effort — don't fail the action if this write itself errors.
    try {
      const [s] = await db
        .select({ accountId: sessions.accountId })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      if (s) {
        await db
          .update(practitionerSettings)
          .set({
            googleLastError: errorMsg.slice(0, 1000),
            googleLastErrorAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(practitionerSettings.accountId, s.accountId));
      }
    } catch (writeErr) {
      console.warn("[syncSessionToGoogle] couldn't persist error:", writeErr);
    }
    return { ok: false, error: errorMsg };
  }
}

async function deleteSessionFromGoogle(
  accountId: string,
  googleEventId: string | null,
  opts?: { notify?: boolean }
) {
  if (!googleEventId) return;
  try {
    const { deleteCalendarEvent } = await import("./google-calendar");
    await deleteCalendarEvent(accountId, googleEventId, opts);
  } catch (err) {
    console.warn("Google Calendar delete failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI SESSION NOTES — transcript → structured markdown
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateNotesActionResult = {
  ok: true;
  notes: string;
  cacheReadTokens: number;
  cacheCreationTokens: number;
} | { ok: false; error: string };

export async function generateNotesForSession(
  formData: FormData
): Promise<GenerateNotesActionResult> {
  const { accountId } = await requireSession();
  const sessionId = required(str(formData, "sessionId"), "Session id");
  const transcript = required(str(formData, "transcript"), "Transcript");
  const templateId = str(formData, "templateId");
  const replaceExisting = bool(formData, "replaceExisting");

  // Look up the session — must belong to the current account.
  const sessionRows = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
    )
    .limit(1);
  const session = sessionRows[0];
  if (!session) return { ok: false, error: "Session not found" };

  const clientRows = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.accountId, accountId), eq(clients.id, session.clientId))
    )
    .limit(1);
  const client = clientRows[0];
  if (!client) return { ok: false, error: "Client not found" };

  let templateName: string | null = null;
  let templateBody: string | null = null;
  if (templateId) {
    const tplRows = await db
      .select()
      .from(noteTemplates)
      .where(
        and(
          eq(noteTemplates.accountId, accountId),
          eq(noteTemplates.id, templateId)
        )
      )
      .limit(1);
    if (tplRows[0]) {
      templateName = tplRows[0].name;
      templateBody = tplRows[0].body;
    }
  }

  let result;
  try {
    const { generateNotesFromTranscript } = await import("./ai-notes");
    result = await generateNotesFromTranscript({
      transcript,
      templateName,
      templateBody,
      clientFirstName: client.fullName.split(" ")[0] ?? client.fullName,
      clientWorkingOn: client.workingOn,
      sessionType: session.type,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI call failed",
    };
  }

  const existingNotes = session.notes?.trim() ?? "";
  const finalNotes =
    replaceExisting || existingNotes.length === 0
      ? result.notes
      : existingNotes + "\n\n---\n\n" + result.notes;

  await db
    .update(sessions)
    .set({ notes: finalNotes, updatedAt: new Date() })
    .where(
      and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
    );

  revalidatePath(`/clients/${session.clientId}`);

  return {
    ok: true,
    notes: finalNotes,
    cacheReadTokens: result.cacheReadTokens,
    cacheCreationTokens: result.cacheCreationTokens,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL INVOICE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInvoice(sessionId: string, clientId: string) {
  // requireSession isn't strictly needed here (the invoices helper looks up
  // the session itself), but call it so unauthenticated requests still bounce.
  await requireSession();
  const { generateInvoiceForSession } = await import("./invoices");
  await generateInvoiceForSession(sessionId);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
}

export type ShareNoteResult =
  | { ok: true; notified: boolean }
  | { ok: false; error: string };

/**
 * Leave a short note the CLIENT can read, on a completed session.
 *
 * `sessions.client_visible_note` has existed since the portal shipped and the
 * portal reads it in two places — the "Since your last session" card on their
 * home, and their session page. But nothing in the app ever WROTE it: there
 * was no field anywhere, so that card could never appear for anyone. This is
 * the missing half.
 *
 * Saving also emails the client that something is waiting, because the portal
 * is otherwise pull-only — she'd write something thoughtful and they'd never
 * know to look. Only clients with portal access get the email.
 */
export async function shareSessionNote(
  sessionId: string,
  note: string
): Promise<ShareNoteResult> {
  try {
    const { accountId } = await requireSession();
    const clean = note.trim().slice(0, 2000);

    const [row] = await db
      .select({
        id: sessions.id,
        clientId: sessions.clientId,
        existing: sessions.clientVisibleNote,
      })
      .from(sessions)
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
      .limit(1);
    if (!row) return { ok: false, error: "Session not found." };

    await db
      .update(sessions)
      .set({
        clientVisibleNote: clean.length > 0 ? clean : null,
        updatedAt: new Date(),
      })
      .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));

    // Only ping them on a NEW note — editing a typo shouldn't email again,
    // and clearing it certainly shouldn't.
    let notified = false;
    if (clean.length > 0 && !row.existing) {
      const { notifyClientOfPortalUpdate } = await import("./portal-notify");
      await notifyClientOfPortalUpdate({
        accountId,
        clientId: row.clientId,
        sessionId,
        kind: "note",
      });
      notified = true;
    }

    revalidatePath(`/clients/${row.clientId}`);
    revalidatePath("/portal");
    revalidatePath(`/portal/sessions/${sessionId}`);
    return { ok: true, notified };
  } catch (err) {
    console.error("[share note] failed:", err);
    return { ok: false, error: "Couldn't save that note." };
  }
}
