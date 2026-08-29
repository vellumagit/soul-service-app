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

/** Attendee-facing Circle emails speak the CIRCLE's language. */
export type CircleEmailLang = "en" | "uk";

/** Normalise a stored group language for the email senders. */
export function asCircleEmailLang(
  raw: string | null | undefined
): CircleEmailLang {
  return raw === "uk" ? "uk" : "en";
}

/** Plain-text contact footer appended to Circle emails. */
function circleContactLineText(lang: CircleEmailLang = "en"): string {
  return lang === "uk"
    ? `Питання, скасування чи повернення коштів? Просто відповідайте на цей лист або пишіть на ${CIRCLE_CONTACT_EMAIL}.`
    : `Questions, or need to cancel or ask about a refund? Just reply, or reach me at ${CIRCLE_CONTACT_EMAIL}.`;
}

/** English escape hatch — the LAST line of every Ukrainian circle email, in
 *  case someone reserved a seat in a УКР Circle without realising. Short,
 *  faded, and in English on purpose. */
const UK_ESCAPE_TEXT =
  "In English: this email is in Ukrainian because this Circle is held in Ukrainian. If that's a surprise, just reply in English — happy to help.";

function ukEscapeHatchHtml(lang: CircleEmailLang): string {
  if (lang !== "uk") return "";
  return `<p style="margin:14px 0 0 0;font-size:11px;line-height:1.55;color:#a39689;">${escapeHtml(UK_ESCAPE_TEXT)}</p>`;
}

function ukEscapeHatchText(lang: CircleEmailLang): string {
  return lang === "uk" ? `\n\n${UK_ESCAPE_TEXT}` : "";
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

export async function sendEmail(
  input: SendEmailInput
): Promise<{ id: string; suppressed?: boolean }> {
  const allowlist = recipientAllowlist();
  if (allowlist) {
    const to = input.to.trim().toLowerCase();
    if (!allowlist.has(to)) {
      // Loud log so Brian can see in Vercel what was suppressed + what
      // it would have sent. Doesn't throw — a suppress isn't a failure and
      // shouldn't break the reminder cron or a fulfilment flow. But it DOES
      // report `suppressed: true`, so a caller that shows a human "Sent to
      // x@y" can tell the truth instead of claiming a delivery that never
      // happened.
      console.log(
        `[email] SUPPRESSED → ${input.to} (not in EMAIL_RECIPIENT_ALLOWLIST). Allowed: ${Array.from(allowlist).join(", ")}. Subject: ${input.subject}`
      );
      return { id: "suppressed", suppressed: true };
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
  /** Reports whether the send was suppressed by EMAIL_RECIPIENT_ALLOWLIST, so
   *  the "Invite sent" confirmation on her side can stay honest. */
}): Promise<{ suppressed: boolean }> {
  const greeting = input.clientFirstName ? `Hi ${input.clientFirstName},` : "Hi,";
  const signoff = input.practitionerName ?? "Your practitioner";
  const subject = "Your space — sign in link";
  const text = `${greeting}\n\nHere's a link to sign in to your space:\n\n${input.url}\n\nIt'll expire in 30 minutes. If you didn't expect this email, you can ignore it.\n\n— ${signoff}`;
  const html = portalMagicLinkHtml(input.url, greeting, signoff);
  const res = await sendEmail({ to: input.to, subject, html, text });
  return { suppressed: res.suppressed === true };
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
  /** The CIRCLE's language — drives every word of the email. */
  language?: CircleEmailLang;
};

function circleGreeting(
  first: string | null,
  lang: CircleEmailLang
): string {
  if (lang === "uk") return first ? `Привіт, ${first}!` : "Привіт!";
  return first ? `Hi ${first},` : "Hi,";
}

/** Welcome / confirmation email sent once a seat is paid (card or manual). */
export async function sendCircleWelcomeEmail(
  input: CircleEmailInput
): Promise<void> {
  const lang = input.language ?? "en";
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = circleGreeting(first, lang);
  const signoff = input.practitionerName ?? "Svitlana";
  const subject =
    lang === "uk"
      ? `Ви з нами — ${input.circleName}, ${input.whenLabel}`
      : `You're in — ${input.circleName} on ${input.whenLabel}`;
  const linkLine = input.meetingUrl
    ? lang === "uk"
      ? `\n\nПриєднуйтеся за цим посиланням, коли настане час:\n${input.meetingUrl}`
      : `\n\nJoin here when it's time:\n${input.meetingUrl}`
    : lang === "uk"
      ? "\n\nПосилання на зустріч надішлю перед тим, як ми зберемося."
      : "\n\nI'll send the meeting link before we gather.";
  const noteLine = input.note ? `\n\n${input.note}` : "";
  const cancelLine = input.cancelUrl
    ? lang === "uk"
      ? `\n\nНе зможете прийти? Скасувати й запросити повернення:\n${input.cancelUrl}`
      : `\n\nCan't make it? Cancel & request a refund:\n${input.cancelUrl}`
    : "";
  const heldLine =
    lang === "uk"
      ? `Ваше місце в ${input.circleName} закріплене. 🤍`
      : `Your seat in ${input.circleName} is held. 🤍`;
  const whenWord = lang === "uk" ? "Коли" : "When";
  const closing =
    lang === "uk"
      ? "Перед початком прийде лагідне нагадування. Приходьте як є."
      : "You'll get a gentle reminder before we begin. Come as you are.";
  const text = `${greeting}

${heldLine}

· ${whenWord}: ${input.whenLabel}${linkLine}${noteLine}

${closing}${cancelLine}

${circleContactLineText(lang)}

— ${signoff}${ukEscapeHatchText(lang)}`;
  const html = circleEmailHtml({
    greeting,
    intro:
      lang === "uk"
        ? `Ваше місце в <strong>${escapeHtml(input.circleName)}</strong> закріплене.`
        : `Your seat in <strong>${escapeHtml(input.circleName)}</strong> is held.`,
    whenLabel: input.whenLabel,
    meetingUrl: input.meetingUrl,
    note: input.note ?? null,
    closing,
    signoff,
    cancelUrl: input.cancelUrl ?? null,
    lang,
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
  const lang = input.language ?? "en";
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = circleGreeting(first, lang);
  const signoff = input.practitionerName ?? "Svitlana";
  const soon =
    lang === "uk"
      ? input.lead === "1h"
        ? "приблизно за годину"
        : "завтра"
      : input.lead === "1h"
        ? "in about an hour"
        : "tomorrow";
  const subject =
    lang === "uk"
      ? input.lead === "1h"
        ? `Скоро починаємо — ${input.circleName}`
        : `Завтра — ${input.circleName}, ${input.whenLabel}`
      : input.lead === "1h"
        ? `Starting soon — ${input.circleName}`
        : `Tomorrow — ${input.circleName} on ${input.whenLabel}`;
  const linkLine = input.meetingUrl
    ? lang === "uk"
      ? `\n\nПриєднатися:\n${input.meetingUrl}`
      : `\n\nJoin here:\n${input.meetingUrl}`
    : "";
  const cancelLine = input.cancelUrl
    ? lang === "uk"
      ? `\n\nНе зможете прийти? Скасувати й запросити повернення:\n${input.cancelUrl}`
      : `\n\nCan't make it? Cancel & request a refund:\n${input.cancelUrl}`
    : "";
  const reminderLine =
    lang === "uk"
      ? `Лагідне нагадування: ${input.circleName} збирається ${soon}.`
      : `A gentle reminder that ${input.circleName} gathers ${soon}.`;
  const whenWord = lang === "uk" ? "Коли" : "When";
  const closing =
    lang === "uk"
      ? "Зробіть вдих. До зустрічі."
      : "Take a breath. I'll see you there.";
  const text = `${greeting}

${reminderLine}

· ${whenWord}: ${input.whenLabel}${linkLine}

${closing}${cancelLine}

${circleContactLineText(lang)}

— ${signoff}${ukEscapeHatchText(lang)}`;
  const html = circleEmailHtml({
    greeting,
    intro:
      lang === "uk"
        ? `Лагідне нагадування: <strong>${escapeHtml(input.circleName)}</strong> збирається ${soon}.`
        : `A gentle reminder that <strong>${escapeHtml(input.circleName)}</strong> gathers ${soon}.`,
    whenLabel: input.whenLabel,
    meetingUrl: input.meetingUrl,
    note: null,
    closing,
    signoff,
    cancelUrl: input.cancelUrl ?? null,
    lang,
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
  language?: CircleEmailLang;
}): Promise<void> {
  const lang = input.language ?? "en";
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = circleGreeting(first, lang);
  const signoff = input.practitionerName ?? "Svitlana";
  const t =
    lang === "uk"
      ? {
          subject: `Дякую, що були з нами — ${input.circleName}`,
          thanks: `Дякую, що були в ${input.circleName} цього вечора. Скільки б ви не поділилися — чи просто були свідком — ваша присутність тримала цей простір.`,
          thanksHtml: `Дякую, що були в <strong>${escapeHtml(input.circleName)}</strong> цього вечора. Скільки б ви не поділилися — чи просто були свідком — ваша присутність тримала цей простір.`,
          settle: "Будьте лагідні до себе, поки все вкладається.",
          ctaText: (url: string) =>
            `\n\nЯкщо це відчулося як дім — наступне Коло відкрите, приходьте знову:\n${url}`,
          ctaButton: "Прийти на наступне Коло →",
          reply:
            "А якщо щось відгукнулося і хочеться продовжити віч-на-віч — просто відповідайте на цей лист. Я буду рада посидіти з вами.",
        }
      : {
          subject: `Thank you for being here — ${input.circleName}`,
          thanks: `Thank you for being in ${input.circleName} tonight. However much you shared or simply witnessed, your presence was part of what held the room.`,
          thanksHtml: `Thank you for being in <strong>${escapeHtml(input.circleName)}</strong> tonight. However much you shared or simply witnessed, your presence was part of what held the room.`,
          settle: "Be gentle with yourself as it settles.",
          ctaText: (url: string) =>
            `\n\nIf it felt like home, the next Circle is open — come again:\n${url}`,
          ctaButton: "Come to the next Circle →",
          reply:
            "And if something stirred that you'd like to follow one-to-one, just reply — I'd love to sit with you.",
        };
  const subject = t.subject;
  const ctaText = input.nextCircleUrl ? t.ctaText(input.nextCircleUrl) : "";
  const text = `${greeting}

${t.thanks}

${t.settle}${ctaText}

${t.reply}

— ${signoff}${ukEscapeHatchText(lang)}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">${t.thanksHtml}</p>
      <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(t.settle)}</p>
      ${
        input.nextCircleUrl
          ? `<a href="${escapeHtml(input.nextCircleUrl)}" style="display:inline-block;margin:18px 0 6px 0;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${t.ctaButton}</a>`
          : ""
      }
      <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#564a42;">${escapeHtml(t.reply)}</p>
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(signoff)}</p>
      ${ukEscapeHatchHtml(lang)}
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
  language?: CircleEmailLang;
}): Promise<void> {
  const lang = input.language ?? "en";
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = circleGreeting(first, lang);
  const signoff = input.practitionerName ?? "Svitlana";
  const t =
    lang === "uk"
      ? {
          subject: "Якщо Коло ще з вами",
          good: `Було добре мати вас у ${input.circleName} цього тижня.`,
          goodHtml: `Було добре мати вас у <strong>${escapeHtml(input.circleName)}</strong> цього тижня.`,
          opens:
            "Іноді Коло відкриває те, що не завершується разом із дзвінком — ниточка, що тягнеться ще день-два. Якщо це про вас — зазвичай це означає, що цьому потрібно більше простору, ніж може дати груповий вечір.",
          oneToOne: "Саме для цього є робота віч-на-віч.",
          replyText:
            "Найпростіше почати — просто відповісти на цей лист і розповісти, що з вами лишилося. Я читаю кожну відповідь сама. Або, якщо хочете спочатку роздивитися:",
          replyHtml:
            "Найпростіше почати — <strong>просто відповісти на цей лист</strong> і розповісти, що з вами лишилося. Я читаю кожну відповідь сама. Або, якщо хочете спочатку роздивитися:",
          button: "Формати роботи →",
          noPressure: "У будь-якому разі — без тиску. Коло завжди тут.",
        }
      : {
          subject: "If the Circle is still with you",
          good: `It was good to have you in ${input.circleName} this week.`,
          goodHtml: `It was good to have you in <strong>${escapeHtml(input.circleName)}</strong> this week.`,
          opens:
            "Sometimes a Circle opens something that doesn't finish when the call ends — a thread that keeps tugging a day or two later. If that's happening for you, it usually means it wants more room than a group evening can give it.",
          oneToOne: "That's what one-to-one work is for.",
          replyText:
            "The simplest way to start is to just reply to this note and tell me what's been sitting with you — I read every reply myself. Or, if you'd rather look first:",
          replyHtml:
            "The simplest way to start is to <strong>just reply to this note</strong> and tell me what's been sitting with you — I read every reply myself. Or, if you'd rather look first:",
          button: "Ways to work together →",
          noPressure: "Either way, no pressure. The Circle is always here.",
        };
  const subject = t.subject;
  const text = `${greeting}

${t.good}

${t.opens}

${t.oneToOne}

${t.replyText}

${input.optionsUrl}

${t.noPressure}

— ${signoff}${ukEscapeHatchText(lang)}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">${t.goodHtml}</p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(t.opens)}</p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(t.oneToOne)}</p>
      <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#564a42;">${t.replyHtml}</p>
      <a href="${escapeHtml(input.optionsUrl)}" style="display:inline-block;margin:14px 0 6px 0;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${t.button}</a>
      <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#8a7c70;">${escapeHtml(t.noPressure)}</p>
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(signoff)}</p>
      ${ukEscapeHatchHtml(lang)}
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

/** T-10 "walk in now" nudge to the practitioner, for a 1-on-1 SESSION.
 *
 *  The Circle version below is the same idea for groups. This one carries the
 *  two things she actually wants in the doorway: who's coming, and what they
 *  said they were bringing. `walkInUrl` is the Meet link when there is one,
 *  otherwise her prep page — an in-person session still deserves the prompt,
 *  it just points somewhere different.
 *
 *  English only, matching the 24h/1h session reminders. (Circle emails follow
 *  the circle's language; 1-on-1 emails have never been localized.) */
export async function sendSessionWalkInNudgeEmail(input: {
  to: string;
  clientName: string;
  whenLabel: string;
  walkInUrl: string;
  isMeetLink: boolean;
  clientStatedIntention: string | null;
}): Promise<void> {
  const first = input.clientName.split(" ")[0] ?? input.clientName;
  const subject = `Starting in 10 minutes — ${first}`;
  const bringing = input.clientStatedIntention
    ? `\n\nThey said they're bringing:\n"${input.clientStatedIntention}"`
    : "";
  const text = `Your session with ${input.clientName} starts in about 10 minutes (${input.whenLabel}).${bringing}

${input.isMeetLink ? `Open the room:\n${input.walkInUrl}` : `Walk in:\n${input.walkInUrl}`}

Take a breath. See you in there.`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b05c36;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Starting in 10 minutes</p>
      <p style="margin:0 0 4px 0;font-size:20px;line-height:1.3;color:#3d342e;"><strong>${escapeHtml(input.clientName)}</strong></p>
      <p style="margin:0 0 18px 0;font-size:14px;color:#8a7c70;">${escapeHtml(input.whenLabel)}</p>
      ${
        input.clientStatedIntention
          ? `<p style="margin:0 0 18px 0;padding-left:14px;border-left:2px solid #ead9c1;font-size:15px;line-height:1.5;color:#564a42;font-style:italic;">&ldquo;${escapeHtml(input.clientStatedIntention)}&rdquo;</p>`
          : ""
      }
      <a href="${escapeHtml(input.walkInUrl)}" style="display:inline-block;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:15px;font-weight:500;padding:14px 26px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${input.isMeetLink ? "Open the room →" : "Walk in →"}</a>
      <p style="margin:22px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">Take a breath. See you in there.</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({ to: input.to, subject, html, text });
}

/** The CLIENT half of the 1-on-1 T-10 — the Meet link in their hand at the
 *  moment the session opens. Only sent when there IS a link: for an in-person
 *  session a "walk in →" email with nowhere to go is noise, not help. */
export async function sendClientWalkInEmail(input: {
  to: string;
  clientName: string;
  meetUrl: string;
  practitionerName: string | null;
}): Promise<void> {
  const first = input.clientName.split(" ")[0] ?? input.clientName;
  const signoff = input.practitionerName ?? "Your practitioner";
  const subject = "We're beginning";
  const text = `${first},

Our session is beginning now.

Join:
${input.meetUrl}

See you in there.

— ${signoff}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b05c36;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">We're beginning</p>
      <p style="margin:0 0 18px 0;font-size:20px;line-height:1.3;color:#3d342e;">${escapeHtml(first)}, our session is starting now.</p>
      <a href="${escapeHtml(input.meetUrl)}" style="display:inline-block;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:15px;font-weight:500;padding:14px 26px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Join →</a>
      <p style="margin:22px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">See you in there.</p>
      <p style="margin:14px 0 0 0;font-size:14px;color:#8a7c70;">— ${escapeHtml(signoff)}</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({ to: input.to, subject, html, text });
}

/** T-10 "walk in now" nudge to the practitioner. The 1h heads-up tells her a
 *  Circle is coming; this is the doorway prompt at the moment of action, with
 *  the room link as the only thing to click. Short by design — it's read on a
 *  phone ten minutes before she opens the room. */
export async function sendCircleWalkInNudgeEmail(input: {
  to: string;
  circleName: string;
  whenLabel: string;
  meetingUrl: string | null;
  attendeeCount: number;
}): Promise<void> {
  const subject = `Starting in 10 minutes — ${input.circleName}`;
  const who =
    input.attendeeCount === 1
      ? "1 person is expected."
      : `${input.attendeeCount} people are expected.`;
  const text = `${input.circleName} starts in about 10 minutes (${input.whenLabel}).

${who}
${input.meetingUrl ? `\nOpen the room:\n${input.meetingUrl}\n` : ""}
See you in there.`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b05c36;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Starting in 10 minutes</p>
      <p style="margin:0 0 4px 0;font-size:20px;line-height:1.3;color:#3d342e;"><strong>${escapeHtml(input.circleName)}</strong></p>
      <p style="margin:0 0 18px 0;font-size:14px;color:#8a7c70;">${escapeHtml(input.whenLabel)} · ${escapeHtml(who)}</p>
      ${
        input.meetingUrl
          ? `<a href="${escapeHtml(input.meetingUrl)}" style="display:inline-block;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:15px;font-weight:500;padding:14px 26px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Walk into the Circle →</a>`
          : `<p style="margin:0;font-size:14px;color:#b05c36;">No meeting link is set for this Circle — add one on its page before you start.</p>`
      }
      <p style="margin:22px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">See you in there.</p>
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

/** T-10 "we're starting, walk in →" nudge to a GUEST. The 1h reminder tells
 *  them it's coming; this lands the link in their hand at the moment the
 *  Circle actually opens. Short — read on a phone ten minutes before. */
export async function sendCircleGuestWalkInEmail(input: {
  to: string;
  attendeeName: string | null;
  circleName: string;
  meetingUrl: string | null;
  practitionerName: string | null;
  language?: CircleEmailLang;
}): Promise<void> {
  const lang = input.language ?? "en";
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting =
    lang === "uk" ? (first ? `${first},` : "Привіт!") : first ? `${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const t =
    lang === "uk"
      ? {
          subject: `Ми починаємо — ${input.circleName}`,
          tag: "Ми починаємо",
          startingText: `${input.circleName} починається просто зараз.`,
          startingHtml: `<strong>${escapeHtml(input.circleName)}</strong> починається просто зараз.`,
          walkIn: (url: string) => `\n\nУвійти:\n${url}`,
          button: "Увійти до Кола →",
          linkSoon: "Ведуча за мить надішле посилання на кімнату.",
          seeYou: "До зустрічі в колі.",
        }
      : {
          subject: `We're beginning — ${input.circleName}`,
          tag: "We're beginning",
          startingText: `${input.circleName} is beginning now.`,
          startingHtml: `<strong>${escapeHtml(input.circleName)}</strong> is starting now.`,
          walkIn: (url: string) => `\n\nWalk in:\n${url}`,
          button: "Walk into the Circle →",
          linkSoon: "Your host will share the room link shortly.",
          seeYou: "See you in the circle.",
        };
  const subject = t.subject;
  const text = `${greeting}

${t.startingText}${input.meetingUrl ? t.walkIn(input.meetingUrl) : ""}

${t.seeYou}

— ${signoff}${ukEscapeHatchText(lang)}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b05c36;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(t.tag)}</p>
      <p style="margin:0 0 18px 0;font-size:20px;line-height:1.3;color:#3d342e;">${t.startingHtml}</p>
      ${
        input.meetingUrl
          ? `<a href="${escapeHtml(input.meetingUrl)}" style="display:inline-block;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:15px;font-weight:500;padding:14px 26px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${t.button}</a>`
          : `<p style="margin:0;font-size:14px;color:#8a7c70;">${escapeHtml(t.linkSoon)}</p>`
      }
      <p style="margin:22px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">${escapeHtml(t.seeYou)}</p>
      <p style="margin:16px 0 0 0;font-size:14px;color:#564a42;">— ${escapeHtml(signoff)}</p>
      ${ukEscapeHatchHtml(lang)}
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
  language?: CircleEmailLang;
  /** True when the seat was paid outside Stripe (Venmo/cash/e-transfer) —
   *  the money comes back directly from the practitioner, not "to your
   *  original payment method". */
  manual?: boolean;
}): Promise<void> {
  const lang = input.language ?? "en";
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = circleGreeting(first, lang);
  const signoff = input.practitionerName ?? "Svitlana";
  const t =
    lang === "uk"
      ? {
          subject: `Кошти повернено — ${input.circleName}`,
          bodyText: input.manual
            ? `Ваше місце в ${input.circleName} (${input.whenLabel}) звільнено, і Світлана поверне вам оплату напряму — так само, як ви платили.`
            : `Вашу оплату за ${input.circleName} (${input.whenLabel}) повернено — кошти повернуться на ваш початковий спосіб оплати протягом кількох робочих днів, а місце звільнено.`,
          bodyHtml: input.manual
            ? `Ваше місце в <strong>${escapeHtml(input.circleName)}</strong> звільнено, і Світлана <strong>поверне вам оплату напряму</strong> — так само, як ви платили.`
            : `Вашу оплату за <strong>${escapeHtml(input.circleName)}</strong> <strong>повернено</strong> — кошти повернуться на ваш початковий спосіб оплати протягом кількох робочих днів, а місце звільнено.`,
          circleWord: "Коло:",
          reachPre:
            "Якщо це несподівано, або ви хочете приєднатися іншого тижня — просто відповідайте або пишіть на ",
          reachText: (email: string) =>
            `Якщо це несподівано, або ви хочете приєднатися іншого тижня — просто відповідайте або пишіть на ${email}.`,
        }
      : {
          subject: `Refunded — ${input.circleName}`,
          bodyText: input.manual
            ? `Your seat in ${input.circleName} (${input.whenLabel}) has been released, and Svitlana will return your payment directly — the same way you paid.`
            : `Your payment for ${input.circleName} (${input.whenLabel}) has been refunded — it will return to your original payment method within a few business days, and your seat has been released.`,
          bodyHtml: input.manual
            ? `Your seat in <strong>${escapeHtml(input.circleName)}</strong> has been released, and Svitlana will <strong>return your payment directly</strong> — the same way you paid.`
            : `Your payment for <strong>${escapeHtml(input.circleName)}</strong> has been <strong>refunded</strong> — it will return to your original payment method within a few business days, and your seat has been released.`,
          circleWord: "Circle:",
          reachPre:
            "If this wasn't expected, or you'd like to join another week, just reply or reach me at ",
          reachText: (email: string) =>
            `If this wasn't expected, or you'd like to join another week, just reply or reach me at ${email}.`,
        };
  const subject = t.subject;
  const text = `${greeting}

${t.bodyText}

${t.reachText(CIRCLE_CONTACT_EMAIL)}

— ${signoff}${ukEscapeHatchText(lang)}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#564a42;">${t.bodyHtml}</p>
      <p style="margin:0 0 8px 0;font-size:14px;color:#564a42;"><strong>${escapeHtml(t.circleWord)}</strong> ${escapeHtml(input.whenLabel)}</p>
      <p style="margin:22px 0 0 0;font-size:14px;line-height:1.6;color:#564a42;">${escapeHtml(t.reachPre)}<a href="mailto:${escapeHtml(CIRCLE_CONTACT_EMAIL)}" style="color:#5a3f4f;">${escapeHtml(CIRCLE_CONTACT_EMAIL)}</a>.</p>
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(signoff)}</p>
      ${ukEscapeHatchHtml(lang)}
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

/** Sent to every attendee when the practitioner CANCELS a Circle session.
 *  Before this existed, cancelling silently stranded paid guests — the only
 *  signal was Google Calendar's removal, which never reached guests whose
 *  invite sync had failed. */
export async function sendCircleCancelledEmail(input: {
  to: string;
  attendeeName: string | null;
  circleName: string;
  whenLabel: string;
  practitionerName: string | null;
  /** They paid (any method) — a refund is owed. */
  wasPaid: boolean;
  /** Paid by card — the refund arrives automatically once she approves. */
  paidViaStripe: boolean;
  language?: CircleEmailLang;
}): Promise<void> {
  const lang = input.language ?? "en";
  const first = input.attendeeName?.split(" ")[0] ?? null;
  const greeting = circleGreeting(first, lang);
  const signoff = input.practitionerName ?? "Svitlana";
  const t =
    lang === "uk"
      ? {
          subject: `Скасовано — ${input.circleName}, ${input.whenLabel}`,
          bodyText: `Мені шкода — ${input.circleName} (${input.whenLabel}) цього разу не збереться. Зустріч скасовано.`,
          bodyHtml: `Мені шкода — <strong>${escapeHtml(input.circleName)}</strong> (${escapeHtml(input.whenLabel)}) цього разу не збереться. Зустріч <strong>скасовано</strong>.`,
          refundStripe:
            "Вашу оплату буде повернено — щойно повернення пройде, вам прийде окремий лист із підтвердженням.",
          refundManual:
            "Світлана поверне вам оплату напряму — так само, як ви платили.",
          hope: "Сподіваюся побачити вас в іншому Колі — вони збираються щотижня.",
        }
      : {
          subject: `Cancelled — ${input.circleName}, ${input.whenLabel}`,
          bodyText: `I'm sorry — ${input.circleName} (${input.whenLabel}) can't gather this time. The session has been cancelled.`,
          bodyHtml: `I'm sorry — <strong>${escapeHtml(input.circleName)}</strong> (${escapeHtml(input.whenLabel)}) can't gather this time. The session has been <strong>cancelled</strong>.`,
          refundStripe:
            "Your payment will be refunded — you'll get a separate confirmation email the moment it goes through.",
          refundManual:
            "Svitlana will return your payment directly — the same way you paid.",
          hope: "I hope to see you at another Circle — they gather every week.",
        };
  const refundLine = input.wasPaid
    ? input.paidViaStripe
      ? t.refundStripe
      : t.refundManual
    : null;
  const text = `${greeting}

${t.bodyText}${refundLine ? `\n\n${refundLine}` : ""}

${t.hope}

${circleContactLineText(lang)}

— ${signoff}${ukEscapeHatchText(lang)}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">${t.bodyHtml}</p>
      ${
        refundLine
          ? `<p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(refundLine)}</p>`
          : ""
      }
      <p style="margin:0 0 0 0;font-size:14px;line-height:1.6;color:#564a42;">${escapeHtml(t.hope)}</p>
      <p style="margin:20px 0 0 0;font-size:14px;color:#564a42;font-style:italic;">— ${escapeHtml(signoff)}</p>
      <p style="margin:22px 0 0 0;padding-top:16px;border-top:1px solid #ead9c1;font-size:12px;line-height:1.6;color:#8a7d71;">${escapeHtml(circleContactLineText(lang))}</p>
      ${ukEscapeHatchHtml(lang)}
    </div>
  </body>
</html>`.trim();
  await sendEmail({
    to: input.to,
    subject: t.subject,
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
  // `who` is attendee-typed (public form) — escape it; this string goes
  // into the HTML body below.
  const lead = input.paid
    ? `${escapeHtml(who)} can't make it and asked to cancel &amp; be refunded.`
    : `${escapeHtml(who)} can't make it and cancelled their (unpaid) spot.`;
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
  lang?: CircleEmailLang;
}): string {
  const lang = p.lang ?? "en";
  const L =
    lang === "uk"
      ? {
          when: "Коли:",
          join: "Приєднатися до Кола",
          linkFollows:
            "Посилання на зустріч надішлю перед тим, як ми зберемося.",
          cancel: "Не зможете прийти? Скасувати й запросити повернення →",
          contactPre:
            "Питання, скасування чи повернення коштів? Просто відповідайте на цей лист або пишіть на ",
        }
      : {
          when: "When:",
          join: "Join the Circle",
          linkFollows: "The meeting link will follow before we gather.",
          cancel: "Can't make it? Cancel &amp; request a refund →",
          contactPre:
            "Questions, or need to cancel or ask about a refund? Just reply, or reach me at ",
        };
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(p.greeting)}</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#564a42;">${p.intro}</p>
      <p style="margin:0 0 8px 0;font-size:14px;color:#564a42;"><strong>${L.when}</strong> ${escapeHtml(p.whenLabel)}</p>
      ${
        p.meetingUrl
          ? `<a href="${escapeHtml(p.meetingUrl)}" style="display:inline-block;margin:16px 0 8px 0;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${L.join}</a>
      <p style="margin:8px 0 0 0;font-size:12px;color:#786b60;line-height:1.5;word-break:break-all;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(p.meetingUrl)}</p>`
          : `<p style="margin:8px 0 0 0;font-size:13px;color:#786b60;font-style:italic;">${L.linkFollows}</p>`
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
          ? `<p style="margin:22px 0 0 0;font-size:13px;line-height:1.6;"><a href="${escapeHtml(p.cancelUrl)}" style="color:#8a7d71;">${L.cancel}</a></p>`
          : ""
      }
      <p style="margin:${p.cancelUrl ? "12px" : "22px"} 0 0 0;padding-top:16px;border-top:1px solid #ead9c1;font-size:12px;line-height:1.6;color:#8a7d71;">${L.contactPre}<a href="mailto:${escapeHtml(CIRCLE_CONTACT_EMAIL)}" style="color:#5a3f4f;">${escapeHtml(CIRCLE_CONTACT_EMAIL)}</a>.</p>
      ${ukEscapeHatchHtml(lang)}
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
// Lead-magnet delivery — the "instant download" email sent the moment someone
// opts in on a /free/<slug> page. Bilingual: sent in the visitor's own language
// (blank copy already fell back to the other language before it reached here).
// The button points straight at the asset — a Blob download for a pdf/image, or
// the external URL for a pasted video link.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendLeadMagnetDeliveryEmail(input: {
  to: string;
  name: string | null;
  lang: "en" | "uk";
  title: string;
  assetUrl: string;
  assetLabel: string;
  practitionerName: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  replyTo?: string;
}): Promise<void> {
  const first = input.name?.split(" ")[0]?.trim() || null;
  const uk = input.lang === "uk";
  const signoff = input.practitionerName ?? "Svitlana";

  const greeting = uk
    ? first
      ? `Вітаю, ${first},`
      : "Вітаю,"
    : first
    ? `Hi ${first},`
    : "Hi,";
  const subject = uk
    ? "Готово — ваш матеріал уже тут"
    : `Your ${input.title} is ready`;
  const intro = uk
    ? `Ось «${input.title}», який ви просили — він ваш назавжди. Знайдіть кілька тихих хвилин для нього, коли зможете.`
    : `Here's the ${input.title} you asked for — it's yours to keep. Find a quiet few minutes for it when you can.`;
  const closing = uk ? "Рада, що ви тут." : "I'm glad you're here.";
  const orCopy = uk
    ? "Або скопіюйте це посилання:"
    : "Or copy and paste this link:";
  const nextIntro = uk ? "Коли відчуєте, що час:" : "When the time feels right:";

  const text = `${greeting}

${intro}

${input.assetLabel}: ${input.assetUrl}
${input.ctaLabel && input.ctaHref ? `\n${input.ctaLabel}: ${input.ctaHref}\n` : ""}
${closing}

— ${signoff}`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1411;">
    <div style="max-width:480px;margin:40px auto;padding:32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;color:#1a1411;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#3d342e;">${escapeHtml(intro)}</p>
      <a href="${escapeHtml(input.assetUrl)}"
         style="display:inline-block;background:#6b5192;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:9px;">
        ${escapeHtml(input.assetLabel)}
      </a>
      <p style="margin:18px 0 0 0;font-size:12px;color:#9a8b7c;line-height:1.55;">${escapeHtml(
        orCopy
      )}<br><span style="word-break:break-all;color:#6b5192;">${escapeHtml(
    input.assetUrl
  )}</span></p>
      ${
        input.ctaLabel && input.ctaHref
          ? `<hr style="border:none;border-top:1px solid #ead9c1;margin:28px 0;"><p style="margin:0 0 12px 0;font-size:14px;color:#3d342e;">${escapeHtml(
              nextIntro
            )}</p><a href="${escapeHtml(
              input.ctaHref
            )}" style="display:inline-block;background:#ffffff;border:1px solid #c9a24b;color:#8a6d24;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:9px;">${escapeHtml(
              input.ctaLabel
            )}</a>`
          : ""
      }
      <p style="margin:28px 0 0 0;font-size:15px;line-height:1.6;color:#3d342e;">${escapeHtml(
        closing
      )}</p>
      <p style="margin:10px 0 0 0;font-size:15px;color:#1a1411;">— ${escapeHtml(
        signoff
      )}</p>
    </div>
  </body>
</html>`.trim();

  await sendEmail({ to: input.to, subject, html, text, replyTo: input.replyTo });
}

/** Escape a run of her free text, keep line breaks, and turn bare http(s) URLs
 *  into links — so a link she pastes into a follow-up body is clickable. */
function escapeAndLinkify(s: string): string {
  const escaped = escapeHtml(s).replace(/\n/g, "<br>");
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:#6b5192;">${url}</a>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead-magnet follow-up — a nurture email she scheduled to go out some days
// after someone downloaded a lead magnet ("the flow"). The subject + body are
// her own words, in the visitor's language, with {first}/{name} already
// substituted by the caller. Signed with her name automatically, like the
// delivery email.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendLeadMagnetFollowupEmail(input: {
  to: string;
  lang: "en" | "uk";
  subject: string;
  body: string;
  practitionerName: string | null;
  replyTo?: string;
}): Promise<void> {
  const signoff = input.practitionerName ?? "Svitlana";
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const htmlBody = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#3d342e;">${escapeAndLinkify(
          p
        )}</p>`
    )
    .join("");

  const text = `${input.body}\n\n— ${signoff}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1411;">
    <div style="max-width:480px;margin:40px auto;padding:32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      ${htmlBody}
      <p style="margin:24px 0 0 0;font-size:15px;color:#1a1411;">— ${escapeHtml(
        signoff
      )}</p>
    </div>
  </body>
</html>`.trim();

  await sendEmail({ to: input.to, subject: input.subject, html, text, replyTo: input.replyTo });
}

// ─────────────────────────────────────────────────────────────────────────────
// Portal request notification — a client asked for something from inside their
// own space (a reschedule, or a new session). Until this existed, those
// requests only appeared in Loose Ends, which meant she found out whenever she
// next happened to open the app. The client, meanwhile, had been told "your
// practitioner has been notified." Now that sentence is true.
//
// Best-effort: the caller swallows failures so a mail outage never loses the
// request — the row is already committed before this is called.
// ─────────────────────────────────────────────────────────────────────────────

export async function sendPortalRequestNotifyEmail(input: {
  to: string;
  /** "reschedule" → an existing session; "booking" → wants a new one. */
  kind: "reschedule" | "booking";
  clientName: string;
  /** Set for replyTo so she can answer the client straight from her inbox. */
  clientEmail: string | null;
  /** For a reschedule: the session they want moved, already zone-formatted. */
  sessionWhenLabel?: string | null;
  /** For a booking: the times they said work for them. */
  preferredTimes?: string | null;
  /** Whatever they wrote in the free-text box. */
  message: string | null;
  /** Deep link into her workspace — the client profile or Loose Ends. */
  link?: string | null;
}): Promise<void> {
  const isReschedule = input.kind === "reschedule";
  const subject = isReschedule
    ? `${input.clientName} asked to reschedule`
    : `${input.clientName} asked for another session`;
  const lead = isReschedule
    ? `${input.clientName} sent a reschedule request from their portal.`
    : `${input.clientName} would like to book another session.`;

  const details: string[] = [];
  if (isReschedule && input.sessionWhenLabel) {
    details.push(`Session: ${input.sessionWhenLabel}`);
  }
  if (!isReschedule && input.preferredTimes) {
    details.push(`Times that work: ${input.preferredTimes}`);
  }

  const text = `${lead}

${details.length > 0 ? `${details.join("\n")}\n\n` : ""}${
    input.message
      ? `"${input.message}"\n\n`
      : "(They didn't add a note.)\n\n"
  }Nothing has changed on your calendar — this is a request, not an automatic move. Open Loose ends in your workspace to act on it${
    input.clientEmail ? ", or just hit Reply to answer them" : ""
  }.`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1411;">
    <div style="max-width:480px;margin:40px auto;padding:32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:16px;font-weight:600;color:#1a1411;">${escapeHtml(lead)}</p>
      ${details
        .map(
          (d) =>
            `<p style="margin:0 0 4px 0;font-size:14px;color:#564a42;">${escapeHtml(d)}</p>`
        )
        .join("")}
      ${
        input.message
          ? `<div style="margin:16px 0;padding:14px 16px;background:#f6e6ce;border-radius:8px;font-family:Georgia,serif;font-style:italic;font-size:15px;line-height:1.55;color:#3d342e;">&ldquo;${escapeHtml(input.message)}&rdquo;</div>`
          : `<p style="margin:16px 0;font-size:13px;color:#786b60;font-style:italic;">They didn&rsquo;t add a note.</p>`
      }
      <p style="margin:20px 0 0 0;font-size:13px;color:#786b60;line-height:1.55;">Nothing has changed on your calendar — this is a request, not an automatic move.${
        input.link
          ? ` <a href="${escapeHtml(input.link)}" style="color:#7a4a6b;">Open it in your workspace</a>.`
          : " Open Loose ends in your workspace to act on it."
      }</p>
    </div>
  </body>
</html>`.trim();

  await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: input.clientEmail ?? undefined,
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
  /** True when the session was MOVED rather than newly booked. Same shape,
   *  same link, different opening line — a client who gets "You're booked"
   *  for the second time reasonably wonders if they now have two sessions. */
  moved?: boolean;
}): Promise<void> {
  const first = input.clientName?.split(" ")[0] ?? null;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const typeLabel = input.sessionType?.trim() ? input.sessionType.trim() : "session";
  const when = formatSessionLong(input.scheduledAt, input.timeZone);
  const shortDate = formatSessionShortDate(input.scheduledAt, input.timeZone);
  const subject = input.moved
    ? `Moved — our ${typeLabel.toLowerCase()} is now ${shortDate}`
    : `You're booked — ${shortDate}`;
  const leadText = input.moved
    ? `Our ${typeLabel.toLowerCase()} has moved. Here's the new time — nothing else changes, and your link below is the same one.`
    : `You're booked in for our ${typeLabel.toLowerCase()} together. 🤍`;
  const linkLine = input.meetingUrl
    ? `\n\nWhen it's time, join here:\n${input.meetingUrl}`
    : "\n\nI'll share the meeting link with you before we meet.";
  const text = `${greeting}

${leadText}

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
    moved: input.moved === true,
  });
  await sendEmail({ to: input.to, subject, html, text, replyTo: input.replyTo });
}

/** Tell the client a session — or a whole recurring series — was cancelled.
 *  Independent of Google Calendar, so a client without a Google invite (in
 *  person, or Google not connected) still finds out. Never throws. */
export async function sendSessionCancelledEmail(input: {
  to: string;
  clientName: string | null;
  sessionType: string;
  scheduledAt: Date;
  practitionerName: string | null;
  replyTo?: string;
  /** RECIPIENT's local zone (client → session → practice). */
  timeZone: string;
  /** True = the whole recurring series was called off, not just one occurrence. */
  series?: boolean;
}): Promise<void> {
  const first = input.clientName?.split(" ")[0] ?? null;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const signoff = input.practitionerName ?? "Svitlana";
  const typeLabel = input.sessionType?.trim()
    ? input.sessionType.trim()
    : "session";
  const when = formatSessionLong(input.scheduledAt, input.timeZone);
  const shortDate = formatSessionShortDate(input.scheduledAt, input.timeZone);

  const subject = input.series
    ? `Cancelled — our recurring ${typeLabel.toLowerCase()} sessions`
    : `Cancelled — our ${typeLabel.toLowerCase()} on ${shortDate}`;
  const lead = input.series
    ? `I've cancelled our recurring ${typeLabel.toLowerCase()} sessions — nothing further is on the calendar for now.`
    : `I've had to cancel our ${typeLabel.toLowerCase()} on ${when}.`;

  const text = `${greeting}

${lead}

I'm here whenever you'd like to find another time — just reply to this email.

Warmly,
${signoff}`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b05c36;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Cancelled</p>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(lead)}</p>
      <p style="margin:24px 0 0 0;font-size:15px;line-height:1.6;color:#564a42;">I'm here whenever you'd like to find another time — just reply.</p>
      <p style="margin:16px 0 0 0;font-size:15px;line-height:1.6;color:#564a42;">Warmly,<br>${escapeHtml(signoff)}</p>
    </div>
  </body>
</html>`;

  await sendEmail({ to: input.to, subject, html, text, replyTo: input.replyTo });
}

function bookingConfirmationHtml(p: {
  greeting: string;
  typeLabel: string;
  when: string;
  durationMinutes: number;
  meetingUrl: string | null;
  signoff: string;
  moved?: boolean;
}): string {
  const lead = p.moved
    ? `Our <strong>${escapeHtml(p.typeLabel.toLowerCase())}</strong> has moved. Here's the new time — nothing else changes.`
    : `You're booked in for our <strong>${escapeHtml(p.typeLabel.toLowerCase())}</strong> together.`;
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      ${p.moved ? `<p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b05c36;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">New time</p>` : ""}
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${escapeHtml(p.greeting)}</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#564a42;">${lead}</p>
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

/** "Something new is waiting in your space" — sent when she uploads a session
 *  recap or shares a note. Deliberately contentless: it says something is
 *  there and links to it, rather than reproducing anything private in an
 *  inbox that may not be hers alone. */
export async function sendPortalUpdateEmail(input: {
  to: string;
  clientName: string;
  practitionerName: string | null;
  kind: "note" | "recap";
  link: string | null;
}): Promise<void> {
  const first = input.clientName.split(" ")[0] ?? input.clientName;
  const signoff = input.practitionerName ?? "Your practitioner";
  const what =
    input.kind === "recap"
      ? "a recording from our time together"
      : "a note from after our session";
  const subject =
    input.kind === "recap"
      ? "A recording from our session"
      : "A note from after our session";
  const text = `${first},

I've left ${what} in your space.${input.link ? `\n\n${input.link}` : ""}

— ${signoff}`;
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b05c36;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">In your space</p>
      <p style="margin:0 0 18px 0;font-size:16px;line-height:1.6;color:#564a42;">${escapeHtml(first)}, I've left ${escapeHtml(what)} for you.</p>
      ${
        input.link
          ? `<a href="${escapeHtml(input.link)}" style="display:inline-block;background:#5a3f4f;color:#fdf9f1;text-decoration:none;font-size:15px;font-weight:500;padding:14px 26px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Open your space →</a>`
          : ""
      }
      <p style="margin:22px 0 0 0;font-size:14px;color:#8a7c70;">— ${escapeHtml(signoff)}</p>
    </div>
  </body>
</html>`.trim();
  await sendEmail({ to: input.to, subject, html, text });
}
