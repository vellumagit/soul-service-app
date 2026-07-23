// Resend email client — used for both magic-link sign-in emails AND
// outbound client communication from the EmailComposer.
//
// Lazy-init so the app can build/dev before RESEND_API_KEY is set.
import "server-only";

import { Resend } from "resend";
import {
  formatSessionLong,
  formatSessionShortDate,
} from "./timezone";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local — see .env.example."
    );
  }
  _resend = new Resend(key);
  return _resend;
}

/** The default From address — must be a verified Resend sender domain. */
function defaultFrom(): string {
  return (
    process.env.AUTH_EMAIL_FROM ||
    process.env.RESEND_FROM ||
    "Soul Service <onboarding@resend.dev>"
  );
}

/** Where Circle attendees reach the practitioner for questions,
 *  cancellations, or refunds. Shown in every Circle email AND set as the
 *  reply-to, so a simple reply lands in her inbox. Override with the
 *  CIRCLE_CONTACT_EMAIL env var if the address ever changes. */
const CIRCLE_CONTACT_EMAIL =
  process.env.CIRCLE_CONTACT_EMAIL || "sss@svit.live";

/** Plain-text contact footer appended to Circle emails. */
function circleContactLineText(): string {
  return `Questions, or need to cancel or ask about a refund? Just reply, or reach me at ${CIRCLE_CONTACT_EMAIL}.`;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
};

/** Parse EMAIL_RECIPIENT_ALLOWLIST into a lowercased Set. Empty / unset
 *  means "allow everything" (production behavior). When the env var is
 *  set, ONLY listed recipients get real emails — everything else is
 *  silently dropped with a clear log line. Used during staging so a
 *  practice run on real client data can't accidentally email real
 *  clients. Caller still sees a success-shaped return so upstream
 *  flow logic isn't disrupted. */
function recipientAllowlist(): Set<string> | null {
  const raw = process.env.EMAIL_RECIPIENT_ALLOWLIST;
  if (!raw || !raw.trim()) return null;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const allowlist = recipientAllowlist();
  if (allowlist) {
    const to = input.to.trim().toLowerCase();
    if (!allowlist.has(to)) {
      // Loud log so Brian can see in Vercel what was suppressed + what
      // it would have sent. Returns a fake id so upstream callers
      // (magic-link flows, portal invites, reminder cron) keep
      // their "ok" code path; we don't want a suppress to bubble up
      // as an error.
      console.log(
        `[email] SUPPRESSED → ${input.to} (not in EMAIL_RECIPIENT_ALLOWLIST). Allowed: ${Array.from(allowlist).join(", ")}. Subject: ${input.subject}`
      );
      return { id: "suppressed" };
    }
  }

  const resend = getResend();
  const result = await resend.emails.send({
    from: input.from ?? defaultFrom(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  return { id: result.data?.id ?? "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Magic-link email
// ─────────────────────────────────────────────────────────────────────────────

export async function sendMagicLinkEmail(
  email: string,
  url: string
): Promise<void> {
  const subject = "Sign in to Soul Service";
  const text = `Sign in to Soul Service:\n\n${url}\n\nThis link expires in 15 minutes. If you didn't request this, you can safely ignore the email.`;
  const html = magicLinkHtml(url);
  await sendEmail({ to: email, subject, html, text });
}

function magicLinkHtml(url: string): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:48px auto;padding:32px;background:#ffffff;border-radius:12px;border:1px solid #ececec;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
        <div style="width:24px;height:24px;border-radius:6px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;">
          <div style="width:8px;height:8px;border-radius:50%;background:#ff6b35;"></div>
        </div>
        <span style="font-weight:600;font-size:14px;letter-spacing:-0.01em;">Soul Service</span>
      </div>
      <h1 style="font-size:18px;font-weight:600;margin:0 0 8px 0;letter-spacing:-0.01em;">Sign in to your space</h1>
      <p style="margin:0 0 24px 0;font-size:14px;color:#5a5a5a;line-height:1.55;">
        Click the link below to sign in. It expires in 15 minutes.
      </p>
      <a href="${escapeHtml(url)}"
         style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:12px 20px;border-radius:8px;">
        Sign in
      </a>
      <p style="margin:24px 0 0 0;font-size:12px;color:#9a9a9a;line-height:1.55;">
        Or copy and paste this URL:<br>
        <span style="word-break:break-all;color:#5a5a5a;">${escapeHtml(url)}</span>
      </p>
      <hr style="border:none;border-top:1px solid #ececec;margin:32px 0;">
      <p style="margin:0;font-size:11px;color:#9a9a9a;line-height:1.55;">
        If you didn't request this email, you can safely ignore it. No account changes will be made.
      </p>
    </div>
  </body>
</html>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** True if Resend is configured. Used by EmailComposer to decide between real-send vs mailto fallback. */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Client portal magic-link email
// ─────────────────────────────────────────────────────────────────────────────

/** Sends the client portal magic-link email. Separate from the practitioner
 *  sign-in flow above — different subject, different framing, different
 *  audience. Practitioner-name is the personal sign-off so the link doesn't
 *  feel transactional. */
export async function sendPortalMagicLinkEmail(input: {
  to: string;
  url: string;
  clientFirstName: string | null;
  practitionerName: string | null;
}): Promise<void> {
  const greeting = input.clientFirstName ? `Hi ${input.clientFirstName},` : "Hi,";
  const signoff = input.practitionerName ?? "Your practitioner";
  const subject = "Your space — sign in link";
  const text = `${greeting}\n\nHere's a link to sign in to your space:\n\n${input.url}\n\nIt'll expire in 30 minutes. If you didn't expect this email, you can ignore it.\n\n— ${signoff}`;
  const html = portalMagicLinkHtml(input.url, greeting, signoff);
  await sendEmail({ to: input.to, subject, html, text });
}

function portalMagicLinkHtml(
  url: string,
  greeting: string,
  signoff: string
): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">
        ${escapeHtml(greeting)}
      </p>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#564a42;">
        Here's a link to sign in to your space. It'll expire in 30 minutes.
      </p>
      <a href="${escapeHtml(url)}"
         style="display:inline-block;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.01em;">
        Open your space
      </a>
      <p style="margin:28px 0 8px 0;font-size:13px;color:#786b60;line-height:1.55;">
        Or paste this URL:
      </p>
      <p style="margin:0 0 32px 0;font-size:12px;color:#786b60;line-height:1.5;word-break:break-all;font-family:ui-monospace,Menlo,monospace;">
        ${escapeHtml(url)}
      </p>
      <p style="margin:0;font-size:14px;color:#564a42;font-style:italic;line-height:1.55;">
        — ${escapeHtml(signoff)}
      </p>
      <hr style="border:none;border-top:1px solid #ead9c1;margin:32px 0 16px 0;">
      <p style="margin:0;font-size:11px;color:#a39689;line-height:1.55;">
        If you didn't expect this, you can ignore the email.
      </p>
    </div>
  </body>
</html>`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Circle (group session) emails — welcome on payment + before-session reminders
// ─────────────────────────────────────────────────────────────────────────────

export type CircleEmailInput = {
  to: string;
  attendeeName: string | null;
  circleName: string; // the group's name, e.g. "The Circle"
  whenLabel: string; // pre-formatted date/time string
  meetingUrl: string | null;
  practitionerName: string | null;
  /** Optional note shown under the details — e.g. what to bring / expect. */
  note?: string | null;
  /** Optional "Can't make it?" self-serve cancel/refund link (tokenized). */
  cancelUrl?: string | null;
};

/** Welcome / confirmation email sent once a seat is paid (card or manual). */
export async function sendCircleWelcomeEmail(
  input: CircleEmailInput
): Promise<void> {
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const subject = `You're in — ${input.circleName} on ${input.whenLabel}`;
  const linkLine = input.meetingUrl
    ? `\n\nJoin here when it's time:\n${input.meetingUrl}`
    : "\n\nI'll send the meeting link before we gather.";
  const noteLine = input.note ? `\n\n${input.note}` : "";
  const cancelLine = input.cancelUrl
    ? `\n\nCan't make it? Cancel & request a refund:\n${input.cancelUrl}`
    : "";
  const text = `${greeting}

Your seat in ${input.circleName} is held. 🤍

· When: ${input.whenLabel}${linkLine}${noteLine}

You'll get a gentle reminder before we begin. Come as you are.${cancelLine}

${circleContactLineText()}

— ${signoff}`;
  const html = circleEmailHtml({
    greeting,
    intro: `Your seat in <strong>${escapeHtml(input.circleName)}</strong> is held.`,
    whenLabel: input.whenLabel,
    meetingUrl: input.meetingUrl,
    note: input.note ?? null,
    closing: "You'll get a gentle reminder before we begin. Come as you are.",
    signoff,
    cancelUrl: input.cancelUrl ?? null,
  });
  await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: CIRCLE_CONTACT_EMAIL,
  });
}

/** Reminder email sent 24h and 1h before a Circle. */
export async function sendCircleReminderEmail(
  input: CircleEmailInput & { lead: "24h" | "1h" }
): Promise<void> {
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const soon = input.lead === "1h" ? "in about an hour" : "tomorrow";
  const subject =
    input.lead === "1h"
      ? `Starting soon — ${input.circleName}`
      : `Tomorrow — ${input.circleName} on ${input.whenLabel}`;
  const linkLine = input.meetingUrl
    ? `\n\nJoin here:\n${input.meetingUrl}`
    : "";
  const cancelLine = input.cancelUrl
    ? `\n\nCan't make it? Cancel & request a refund:\n${input.cancelUrl}`
    : "";
  const text = `${greeting}

A gentle reminder that ${input.circleName} gathers ${soon}.

· When: ${input.whenLabel}${linkLine}

Take a breath. I'll see you there.${cancelLine}

${circleContactLineText()}

— ${signoff}`;
  const html = circleEmailHtml({
    greeting,
    intro: `A gentle reminder that <strong>${escapeHtml(input.circleName)}</strong> gathers ${soon}.`,
    whenLabel: input.whenLabel,
    meetingUrl: input.meetingUrl,
    note: null,
    closing: "Take a breath. I'll see you there.",
    signoff,
    cancelUrl: input.cancelUrl ?? null,
  });
  await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: CIRCLE_CONTACT_EMAIL,
  });
}

/** Sent to each attendee the evening after a Circle ends: a warm thank-you and
 *  a gentle come-again CTA (the next open Circle, or a one-to-one). This is the
 *  retention loop — one Circle becomes the next. */
export async function sendCirclePostEmail(input: {
  to: string;
  attendeeName: string | null;
  circleName: string;
  nextCircleUrl: string | null;
  practitionerName: string | null;
}): Promise<void> {
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const subject = `Thank you for being here — ${input.circleName}`;
  const ctaText = input.nextCircleUrl
    ? `\n\nIf it felt like home, the next Circle is open — come again:\n${input.nextCircleUrl}`
    : "";
  const text = `${greeting}

Thank you for being in ${input.circleName} tonight. However much you shared or simply witnessed, your presence was part of what held the room.

Be gentle with yourself as it settles.${ctaText}

And if something stirred that you'd like to follow one-to-one, just reply — I'd love to sit with you.

— ${signoff}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">Thank you for being in <strong>${escapeHtml(input.circleName)}</strong> tonight. However much you shared or simply witnessed, your presence was part of what held the room.</p>
      <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#564a42;">Be gentle with yourself as it settles.</p>
      ${
        input.nextCircleUrl
          ? `<a href="${escapeHtml(input.nextCircleUrl)}" style="display:inline-block;margin:18px 0 6px 0;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Come to the next Circle →</a>`
          : ""
      }
      <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#564a42;">And if something stirred that you&apos;d like to follow one-to-one, just reply — I&apos;d love to sit with you.</p>
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(signoff)}</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: CIRCLE_CONTACT_EMAIL,
  });
}

/** Day-2 "go deeper" invitation — the Circle→1-on-1 conversion email.
 *
 *  Sent ~36h after a Circle ends, in the morning (see
 *  sendDueCircleDeeperInvites for the window). Deliberately separate from the
 *  same-evening thank-you: that one seals the experience (peak-end), this one
 *  arrives when whatever surfaced is still tugging — and names that as the
 *  reason to reach out. Primary CTA is a REPLY (a conversation, not a
 *  purchase); the link to session options is the quieter second door. */
export async function sendCircleDeeperInviteEmail(input: {
  to: string;
  attendeeName: string | null;
  circleName: string;
  optionsUrl: string;
  practitionerName: string | null;
}): Promise<void> {
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const subject = "If the Circle is still with you";
  const text = `${greeting}

It was good to have you in ${input.circleName} this week.

Sometimes a Circle opens something that doesn't finish when the call ends — a thread that keeps tugging a day or two later. If that's happening for you, it usually means it wants more room than a group evening can give it.

That's what one-to-one work is for.

The simplest way to start is to just reply to this note and tell me what's been sitting with you — I read every reply myself. Or, if you'd rather look first:

${input.optionsUrl}

Either way, no pressure. The Circle is always here.

— ${signoff}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">It was good to have you in <strong>${escapeHtml(input.circleName)}</strong> this week.</p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">Sometimes a Circle opens something that doesn&apos;t finish when the call ends — a thread that keeps tugging a day or two later. If that&apos;s happening for you, it usually means it wants more room than a group evening can give it.</p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">That&apos;s what one-to-one work is for.</p>
      <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#564a42;">The simplest way to start is to <strong>just reply to this note</strong> and tell me what&apos;s been sitting with you — I read every reply myself. Or, if you&apos;d rather look first:</p>
      <a href="${escapeHtml(input.optionsUrl)}" style="display:inline-block;margin:14px 0 6px 0;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Ways to work together →</a>
      <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#8a7c70;">Either way, no pressure. The Circle is always here.</p>
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(signoff)}</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: CIRCLE_CONTACT_EMAIL,
  });
}

/** Sent when a Circle seat is refunded — confirms the money is on its way
 *  back, that the seat is released, and how to reach the practitioner. */
export async function sendCircleRefundEmail(input: {
  to: string;
  attendeeName: string | null;
  circleName: string;
  whenLabel: string;
  practitionerName: string | null;
}): Promise<void> {
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const subject = `Refunded — ${input.circleName}`;
  const text = `${greeting}

Your payment for ${input.circleName} (${input.whenLabel}) has been refunded — it will return to your original payment method within a few business days, and your seat has been released.

If this wasn't expected, or you'd like to join another week, just reply or reach me at ${CIRCLE_CONTACT_EMAIL}.

— ${signoff}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#564a42;">Your payment for <strong>${escapeHtml(input.circleName)}</strong> has been <strong>refunded</strong> — it will return to your original payment method within a few business days, and your seat has been released.</p>
      <p style="margin:0 0 8px 0;font-size:14px;color:#564a42;"><strong>Circle:</strong> ${escapeHtml(input.whenLabel)}</p>
      <p style="margin:22px 0 0 0;font-size:14px;line-height:1.6;color:#564a42;">If this wasn't expected, or you'd like to join another week, just reply or reach me at <a href="mailto:${escapeHtml(CIRCLE_CONTACT_EMAIL)}" style="color:#5a3f4f;">${escapeHtml(CIRCLE_CONTACT_EMAIL)}</a>.</p>
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(signoff)}</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: CIRCLE_CONTACT_EMAIL,
  });
}

/** Heads-up to the PRACTITIONER the moment a Circle seat is confirmed — card
 *  or manual. So she knows a sale happened without opening the app. Reply-to is
 *  the attendee, so she can reach them straight from her inbox. */
export async function sendCircleReservationNotifyEmail(input: {
  to: string;
  attendeeName: string | null;
  attendeeEmail: string;
  circleName: string;
  whenLabel: string;
  paid: boolean;
  replyTo?: string;
}): Promise<void> {
  const who = input.attendeeName?.trim() || input.attendeeEmail;
  const verb = input.paid ? "reserved and paid for" : "reserved";
  const subject = `New Circle sign-up — ${who}`;
  const text = `${who} just ${verb} a seat.

· Circle: ${input.circleName}
· When: ${input.whenLabel}
· Name: ${input.attendeeName ?? "—"}
· Email: ${input.attendeeEmail}

They've been sent the welcome email with the meeting link, and added to your Network as a lead. Just reply to reach them.`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:32px 30px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 18px 0;font-size:16px;line-height:1.5;color:#3d342e;"><strong>${escapeHtml(who)}</strong> just ${verb} a seat. 🤍</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>Circle:</strong> ${escapeHtml(input.circleName)}</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>When:</strong> ${escapeHtml(input.whenLabel)}</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>Name:</strong> ${escapeHtml(input.attendeeName ?? "—")}</p>
      <p style="margin:0 0 0 0;font-size:14px;color:#564a42;"><strong>Email:</strong> ${escapeHtml(input.attendeeEmail)}</p>
      <p style="margin:20px 0 0 0;padding-top:16px;border-top:1px solid #ead9c1;font-size:12.5px;line-height:1.6;color:#8a7d71;">They've been sent the welcome email with the meeting link, and added to your Network as a lead. Just reply to reach them.</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({ to: input.to, subject, html, text, replyTo: input.replyTo });
}

/** Heads-up to the practitioner that a paid attendee asked to cancel + be
 *  refunded (via the "Can't make it?" link). It also shows in Loose Ends for
 *  one-tap approval — this email just makes sure she sees it fast. */
export async function sendCircleRefundRequestedEmail(input: {
  to: string;
  attendeeName: string | null;
  attendeeEmail: string;
  circleName: string;
  whenLabel: string;
  paid: boolean;
  replyTo?: string;
}): Promise<void> {
  const who = input.attendeeName?.trim() || input.attendeeEmail;
  const subject = input.paid
    ? `Refund requested — ${who}`
    : `Sign-up cancelled — ${who}`;
  const lead = input.paid
    ? `${who} can't make it and asked to cancel &amp; be refunded.`
    : `${who} can't make it and cancelled their (unpaid) spot.`;
  const leadText = input.paid
    ? `${who} can't make it and asked to cancel + be refunded.`
    : `${who} can't make it and cancelled their (unpaid) spot.`;
  const action = input.paid
    ? `Open Loose Ends → "Refund requests" and tap Approve — that issues the refund and frees the seat.`
    : `Their seat has been released. Nothing else to do.`;
  const text = `${leadText}

· Circle: ${input.circleName}
· When: ${input.whenLabel}
· Name: ${input.attendeeName ?? "—"}
· Email: ${input.attendeeEmail}

${action}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:32px 30px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 18px 0;font-size:16px;line-height:1.5;color:#3d342e;">${lead}</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>Circle:</strong> ${escapeHtml(input.circleName)}</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>When:</strong> ${escapeHtml(input.whenLabel)}</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>Name:</strong> ${escapeHtml(input.attendeeName ?? "—")}</p>
      <p style="margin:0 0 0 0;font-size:14px;color:#564a42;"><strong>Email:</strong> ${escapeHtml(input.attendeeEmail)}</p>
      <p style="margin:20px 0 0 0;padding-top:16px;border-top:1px solid #ead9c1;font-size:13px;line-height:1.6;color:#564a42;">${escapeHtml(action)}</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: input.replyTo,
  });
}

/** "Your Circle starts soon" — to the PRACTITIONER, with the room link and who's
 *  coming, so she can start without opening the app. One per occurrence. */
export async function sendCircleHostReminderEmail(input: {
  to: string;
  circleName: string;
  whenLabel: string;
  meetingUrl: string | null;
  attendees: { name: string; paid: boolean }[];
  practitionerName: string | null;
}): Promise<void> {
  const n = input.attendees.length;
  const paidCount = input.attendees.filter((a) => a.paid).length;
  const subject = `Starting soon — ${input.circleName}`;
  const roster =
    n === 0
      ? "No one has reserved a seat yet."
      : input.attendees
          .map((a) => `· ${a.name}${a.paid ? "" : " (unpaid)"}`)
          .join("\n");
  const text = `${input.circleName} gathers soon.

· When: ${input.whenLabel}
· ${n} ${n === 1 ? "person" : "people"} coming (${paidCount} paid)
${input.meetingUrl ? `\nYour room:\n${input.meetingUrl}\n` : "\nNo meeting link set — add one in Settings → circle room link.\n"}
Who's coming:
${roster}

Take a breath. They're lucky to have you.`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:32px 30px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 18px 0;font-size:16px;line-height:1.5;"><strong>${escapeHtml(input.circleName)}</strong> gathers soon.</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>When:</strong> ${escapeHtml(input.whenLabel)}</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>Coming:</strong> ${n} ${n === 1 ? "person" : "people"} (${paidCount} paid)</p>
      ${
        input.meetingUrl
          ? `<a href="${escapeHtml(input.meetingUrl)}" style="display:inline-block;margin:18px 0 6px 0;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Open your room</a>`
          : `<p style="margin:16px 0 0 0;font-size:13px;color:#a3402a;">No meeting link set — add one in Settings → circle room link.</p>`
      }
      <p style="margin:22px 0 6px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7d71;">Who's coming</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#564a42;">${
        n === 0
          ? "<em>No one has reserved a seat yet.</em>"
          : input.attendees
              .map(
                (a) =>
                  `${escapeHtml(a.name)}${a.paid ? "" : ' <span style="color:#a3402a;font-size:12px;">(unpaid)</span>'}`
              )
              .join("<br>")
      }</p>
      <p style="margin:22px 0 0 0;padding-top:16px;border-top:1px solid #ead9c1;font-size:13px;font-style:italic;color:#786b60;">Take a breath. They're lucky to have you.</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({ to: input.to, subject, html, text });
}

function circleEmailHtml(p: {
  greeting: string;
  intro: string;
  whenLabel: string;
  meetingUrl: string | null;
  note: string | null;
  closing: string;
  signoff: string;
  cancelUrl?: string | null;
}): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(p.greeting)}</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#564a42;">${p.intro}</p>
      <p style="margin:0 0 8px 0;font-size:14px;color:#564a42;"><strong>When:</strong> ${escapeHtml(p.whenLabel)}</p>
      ${
        p.meetingUrl
          ? `<a href="${escapeHtml(p.meetingUrl)}" style="display:inline-block;margin:16px 0 8px 0;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Join the Circle</a>
      <p style="margin:8px 0 0 0;font-size:12px;color:#786b60;line-height:1.5;word-break:break-all;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(p.meetingUrl)}</p>`
          : `<p style="margin:8px 0 0 0;font-size:13px;color:#786b60;font-style:italic;">The meeting link will follow before we gather.</p>`
      }
      ${
        p.note
          ? `<p style="margin:24px 0 0 0;font-size:14px;line-height:1.6;color:#564a42;">${escapeHtml(p.note)}</p>`
          : ""
      }
      <p style="margin:24px 0 0 0;font-size:14px;line-height:1.6;color:#564a42;">${escapeHtml(p.closing)}</p>
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(p.signoff)}</p>
      ${
        p.cancelUrl
          ? `<p style="margin:22px 0 0 0;font-size:13px;line-height:1.6;"><a href="${escapeHtml(p.cancelUrl)}" style="color:#8a7d71;">Can't make it? Cancel &amp; request a refund →</a></p>`
          : ""
      }
      <p style="margin:${p.cancelUrl ? "12px" : "22px"} 0 0 0;padding-top:16px;border-top:1px solid #ead9c1;font-size:12px;line-height:1.6;color:#8a7d71;">Questions, or need to cancel or ask about a refund? Just reply, or reach me at <a href="mailto:${escapeHtml(CIRCLE_CONTACT_EMAIL)}" style="color:#5a3f4f;">${escapeHtml(CIRCLE_CONTACT_EMAIL)}</a>.</p>
    </div>
  </body>
</html>`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing-page inquiry emails — confirmation to the visitor + notify the
// practitioner. Both are best-effort (the caller swallows failures so the
// inquiry is never lost). replyTo is set so replies route the right way.
// ─────────────────────────────────────────────────────────────────────────────

/** Confirmation to the person who submitted the "Send a note" form. */
export async function sendLandingInquiryAckEmail(input: {
  to: string;
  name: string | null;
  practitionerName: string | null;
  replyTo?: string;
}): Promise<void> {
  const first = input.name?.split(" ")[0] ?? null;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const subject = "Thank you for reaching out";
  const text = `${greeting}

Your note arrived — thank you for reaching out. I read every message myself, and I'll reply within a few days, usually sooner.

Take a quiet breath. I'm glad you did.

— ${signoff}`;
  const html = simpleNoteHtml({
    greeting,
    paragraphs: [
      "Your note arrived — thank you for reaching out. I read every message myself, and I'll reply within a few days, usually sooner.",
      "Take a quiet breath. I'm glad you did.",
    ],
    signoff,
  });
  await sendEmail({ to: input.to, subject, html, text, replyTo: input.replyTo });
}

/** Notify the practitioner that a new inquiry came in. replyTo is the
 *  visitor's email so she can just hit Reply to answer them directly. */
export async function sendLandingInquiryNotifyEmail(input: {
  to: string;
  practitionerName: string | null;
  fromName: string;
  fromEmail: string;
  message: string | null;
  preferredWhenLabel?: string | null;
}): Promise<void> {
  const subject = `New inquiry from ${input.fromName}`;
  const detailLines = [
    `From: ${input.fromName} <${input.fromEmail}>`,
  ];
  if (input.preferredWhenLabel) {
    detailLines.push(`Preferred time: ${input.preferredWhenLabel}`);
  }
  const text = `${detailLines.join("\n")}

${input.message ? `"${input.message}"\n\n` : "(No message — just their details.)\n\n"}Reply straight to this email to answer them, or open Network → Inbox.`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1411;">
    <div style="max-width:480px;margin:40px auto;padding:32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:16px;font-weight:600;color:#1a1411;">A new note came in through your landing page.</p>
      <p style="margin:0 0 4px 0;font-size:14px;color:#564a42;"><strong>From:</strong> ${escapeHtml(input.fromName)} &lt;${escapeHtml(input.fromEmail)}&gt;</p>
      ${
        input.preferredWhenLabel
          ? `<p style="margin:0 0 4px 0;font-size:14px;color:#564a42;"><strong>Preferred time:</strong> ${escapeHtml(input.preferredWhenLabel)}</p>`
          : ""
      }
      ${
        input.message
          ? `<div style="margin:16px 0;padding:14px 16px;background:#f6e6ce;border-radius:8px;font-family:Georgia,serif;font-style:italic;font-size:15px;line-height:1.55;color:#3d342e;">&ldquo;${escapeHtml(input.message)}&rdquo;</div>`
          : `<p style="margin:16px 0;font-size:13px;color:#786b60;font-style:italic;">No message — just their details.</p>`
      }
      <p style="margin:20px 0 0 0;font-size:13px;color:#786b60;line-height:1.55;">Just hit <strong>Reply</strong> to answer them directly, or open Network → Inbox in your workspace.</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: input.fromEmail,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Session booking confirmation — app-sent, independent of Google Calendar.
// This is the reliable "you're booked" the client receives the moment a
// 1-on-1 session is scheduled. It does NOT depend on the Google Calendar
// invite succeeding (that's a best-effort layer on top). Sent as a
// best-effort tail of scheduleSession — a mail failure never blocks the
// booking.
//
// TIME ZONE: the when-label renders in the RECIPIENT's local zone (resolved by
// the caller: client zone → session's booked zone → practice zone) with an
// explicit zone suffix, via the shared formatters in ./timezone.
// ─────────────────────────────────────────────────────────────────────────────

export async function sendSessionBookingConfirmationEmail(input: {
  to: string;
  clientName: string | null;
  sessionType: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetingUrl: string | null;
  practitionerName: string | null;
  /** Practitioner's business email, so a client can just hit Reply. */
  replyTo?: string;
  /** IANA zone to render the time in — the RECIPIENT's local zone. Resolved by
   *  the caller (client zone → session zone → practice zone). */
  timeZone: string;
}): Promise<void> {
  const first = input.clientName?.split(" ")[0] ?? null;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const typeLabel = input.sessionType?.trim() ? input.sessionType.trim() : "session";
  const when = formatSessionLong(input.scheduledAt, input.timeZone);
  const shortDate = formatSessionShortDate(input.scheduledAt, input.timeZone);
  const subject = `You're booked — ${shortDate}`;
  const linkLine = input.meetingUrl
    ? `\n\nWhen it's time, join here:\n${input.meetingUrl}`
    : "\n\nI'll share the meeting link with you before we meet.";
  const text = `${greeting}

You're booked in for our ${typeLabel.toLowerCase()} together. 🤍

· When: ${when}
· Length: ${input.durationMinutes} minutes${linkLine}

If anything shifts on your end, just reply to this email and we'll find another time. A quiet, private spot works best when we meet.

Warmly,
${signoff}`;
  const html = bookingConfirmationHtml({
    greeting,
    typeLabel,
    when,
    durationMinutes: input.durationMinutes,
    meetingUrl: input.meetingUrl,
    signoff,
  });
  await sendEmail({ to: input.to, subject, html, text, replyTo: input.replyTo });
}

function bookingConfirmationHtml(p: {
  greeting: string;
  typeLabel: string;
  when: string;
  durationMinutes: number;
  meetingUrl: string | null;
  signoff: string;
}): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(p.greeting)}</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#564a42;">You're booked in for our <strong>${escapeHtml(p.typeLabel.toLowerCase())}</strong> together.</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>When:</strong> ${escapeHtml(p.when)}</p>
      <p style="margin:0 0 8px 0;font-size:14px;color:#564a42;"><strong>Length:</strong> ${p.durationMinutes} minutes</p>
      ${
        p.meetingUrl
          ? `<a href="${escapeHtml(p.meetingUrl)}" style="display:inline-block;margin:16px 0 8px 0;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Join when it's time</a>
      <p style="margin:8px 0 0 0;font-size:12px;color:#786b60;line-height:1.5;word-break:break-all;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(p.meetingUrl)}</p>`
          : `<p style="margin:12px 0 0 0;font-size:13px;color:#786b60;font-style:italic;">I'll share the meeting link with you before we meet.</p>`
      }
      <p style="margin:24px 0 0 0;font-size:14px;line-height:1.6;color:#564a42;">If anything shifts on your end, just reply to this email and we'll find another time. A quiet, private spot works best when we meet.</p>
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(p.signoff)}</p>
    </div>
  </body>
</html>`.trim();
}

function simpleNoteHtml(p: {
  greeting: string;
  paragraphs: string[];
  signoff: string;
}): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(p.greeting)}</p>
      ${p.paragraphs
        .map(
          (para) =>
            `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(para)}</p>`
        )
        .join("\n      ")}
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(p.signoff)}</p>
    </div>
  </body>
</html>`.trim();
}
