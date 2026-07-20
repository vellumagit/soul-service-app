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
  const text = `${greeting}

Your seat in ${input.circleName} is held. 🤍

· When: ${input.whenLabel}${linkLine}${noteLine}

You'll get a gentle reminder before we begin. Come as you are.

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
  const text = `${greeting}

A gentle reminder that ${input.circleName} gathers ${soon}.

· When: ${input.whenLabel}${linkLine}

Take a breath. I'll see you there.

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
  });
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

function circleEmailHtml(p: {
  greeting: string;
  intro: string;
  whenLabel: string;
  meetingUrl: string | null;
  note: string | null;
  closing: string;
  signoff: string;
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
      <p style="margin:22px 0 0 0;padding-top:16px;border-top:1px solid #ead9c1;font-size:12px;line-height:1.6;color:#8a7d71;">Questions, or need to cancel or ask about a refund? Just reply, or reach me at <a href="mailto:${escapeHtml(CIRCLE_CONTACT_EMAIL)}" style="color:#5a3f4f;">${escapeHtml(CIRCLE_CONTACT_EMAIL)}</a>.</p>
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
