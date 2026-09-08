import "server-only";

// ONE email for a whole recurring series — the rhythm in plain words, how many
// sessions and over what span, the next few dates, and where to show up.
// Replaces the single-session "You're booked" that used to go out for
// occurrence #1 and said nothing about the series itself. Google's recurring
// invite (one email) still arrives separately when the series is online.
//
// Bilingual by the client's preferred language: English by default, Ukrainian
// when they've chosen it. Structure is shared; every string is per-language.

import { sendEmail } from "./resend";

type Lang = "en" | "uk";
type Frequency = "weekly" | "biweekly" | "monthly";

export type SeriesConfirmationInput = {
  to: string;
  clientName: string | null;
  sessionType: string;
  frequency: Frequency;
  durationMinutes: number;
  /** Every FUTURE occurrence, ascending. The email lists the next few and
   *  uses first/last for the span. */
  dates: Date[];
  /** Total occurrences in the series (may exceed `dates` when some were
   *  back-filled as already held). */
  totalCount: number;
  inPerson: boolean;
  /** Practice address for in-person series (Settings → business address). */
  address: string | null;
  /** Shared Meet link for online series (null if Google isn't connected). */
  meetingUrl: string | null;
  practitionerName: string | null;
  replyTo?: string;
  /** RECIPIENT's zone — the client's own if known, else the practice's. */
  timeZone: string;
  language: Lang;
};

const NEXT_DATES_SHOWN = 5;

export async function sendSeriesBookingConfirmationEmail(
  input: SeriesConfirmationInput
): Promise<void> {
  const lang = input.language;
  const loc = lang === "uk" ? "uk-UA" : "en-US";
  const tz = input.timeZone;
  const first = input.dates[0];
  const last = input.dates[input.dates.length - 1];
  const firstName = input.clientName?.split(" ")[0]?.trim() || null;
  const signoff = input.practitionerName ?? "Svitlana";
  const typeLabel = input.sessionType?.trim() || (lang === "uk" ? "сесія" : "session");

  const time = new Intl.DateTimeFormat(loc, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(first);
  const weekday = new Intl.DateTimeFormat(loc, {
    weekday: "long",
    timeZone: tz,
  }).format(first);
  const dayOfMonth = Number(
    new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: tz }).format(first)
  );
  const longDate = (d: Date) =>
    new Intl.DateTimeFormat(loc, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: tz,
    }).format(d);
  const shortDate = (d: Date) =>
    new Intl.DateTimeFormat(loc, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: tz,
    }).format(d);

  // Rhythm line. Ukrainian phrasing is built to work with the nominative
  // weekday Intl gives us ("Раз на тиждень — п'ятниця, 09:00"), avoiding case
  // agreement we'd otherwise have to fake.
  const rhythm =
    lang === "uk"
      ? input.frequency === "weekly"
        ? `Раз на тиждень — ${weekday}, ${time}`
        : input.frequency === "biweekly"
          ? `Раз на два тижні — ${weekday}, ${time}`
          : `Раз на місяць — ${dayOfMonth}-го числа, ${time}`
      : input.frequency === "weekly"
        ? `Every week on ${weekday} at ${time}`
        : input.frequency === "biweekly"
          ? `Every two weeks on ${weekday} at ${time}`
          : `Once a month on the ${ordinalEn(dayOfMonth)} at ${time}`;

  const countLabel =
    lang === "uk"
      ? `${input.totalCount} ${ukPlural(input.totalCount, "сесія", "сесії", "сесій")}`
      : `${input.totalCount} ${input.totalCount === 1 ? "session" : "sessions"}`;
  const span =
    input.dates.length > 1
      ? lang === "uk"
        ? `з ${longDate(first)} до ${longDate(last)}`
        : `${longDate(first)} – ${longDate(last)}`
      : longDate(first);

  const upcoming = input.dates.slice(0, NEXT_DATES_SHOWN).map(shortDate);
  const moreCount = Math.max(0, input.dates.length - NEXT_DATES_SHOWN);

  const whereText = input.inPerson
    ? lang === "uk"
      ? `Особисто${input.address ? ` — ${input.address}` : ""}`
      : `In person${input.address ? ` — ${input.address}` : ""}`
    : input.meetingUrl
      ? lang === "uk"
        ? `Онлайн — щоразу те саме посилання:\n${input.meetingUrl}`
        : `Online — the same link every time:\n${input.meetingUrl}`
      : lang === "uk"
        ? "Онлайн — посилання надішлю перед нашою першою зустріччю."
        : "Online — I'll share the meeting link before our first one.";

  const t = {
    subject:
      lang === "uk"
        ? `Ви записані — ${countLabel}, ${cadenceShort("uk", input.frequency)} з ${shortDate(first)}`
        : `You're booked — ${countLabel}, ${cadenceShort("en", input.frequency)} from ${shortDate(first)}`,
    greeting:
      lang === "uk"
        ? firstName ? `Привіт, ${firstName}!` : "Привіт!"
        : firstName ? `Hi ${firstName},` : "Hi,",
    lead:
      lang === "uk"
        ? `Ми домовилися про регулярні зустрічі (${typeLabel}) — ось усе в одному місці, щоб нічого не загубилося. 🤍`
        : `We've set up a regular rhythm for our ${typeLabel.toLowerCase()} together — here's the shape of it, all in one place. 🤍`,
    rhythmWord: lang === "uk" ? "Ритм" : "Rhythm",
    yourTime: lang === "uk" ? "(ваш час)" : "(your time)",
    howMany: lang === "uk" ? "Скільки" : "How many",
    length: lang === "uk" ? "Тривалість" : "Length",
    minutes: lang === "uk" ? "хвилин" : "minutes",
    comingUp: lang === "uk" ? "Найближчі" : "Coming up",
    more: (n: number) =>
      lang === "uk" ? `… і ще ${n}` : `… and ${n} more`,
    where: lang === "uk" ? "Де" : "Where",
    move:
      lang === "uk"
        ? "Потрібно перенести одну зустріч? Просто відповідайте на цей лист — перенесення однієї сесії не змінює решту."
        : "Need to move one? Just reply to this email — moving a single session never changes the rest.",
    warmly: lang === "uk" ? "З теплом," : "Warmly,",
  };

  const text = `${t.greeting}

${t.lead}

· ${t.rhythmWord}: ${rhythm} ${t.yourTime}
· ${t.howMany}: ${countLabel}, ${span}
· ${t.length}: ${input.durationMinutes} ${t.minutes}
· ${t.comingUp}: ${upcoming.join(" · ")}${moreCount > 0 ? ` ${t.more(moreCount)}` : ""}
· ${t.where}: ${whereText}

${t.move}

${t.warmly}
${signoff}`;

  const row = (label: string, value: string) =>
    `<p style="margin:0 0 6px 0;font-size:14px;color:#564a42;"><strong>${esc(label)}:</strong> ${value}</p>`;
  const whereHtml = input.inPerson || !input.meetingUrl
    ? esc(whereText)
    : `${esc(lang === "uk" ? "Онлайн — щоразу те саме посилання" : "Online — the same link every time")}<br>
       <a href="${esc(input.meetingUrl)}" style="display:inline-block;margin:10px 0 4px 0;background:#5a3f4f;color:#fdf9f1;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${esc(lang === "uk" ? "Приєднатися до зустрічі" : "Join the session")}</a><br>
       <span style="font-size:12px;color:#786b60;word-break:break-all;font-family:ui-monospace,Menlo,monospace;">${esc(input.meetingUrl)}</span>`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Georgia,'Times New Roman',serif;color:#3d342e;">
    <div style="max-width:480px;margin:48px auto;padding:36px 32px;background:#fdf9f1;border-radius:12px;border:1px solid #ead9c1;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#564a42;">${esc(t.greeting)}</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#564a42;">${esc(t.lead)}</p>
      ${row(t.rhythmWord, `${esc(rhythm)} <span style="color:#786b60;">${esc(t.yourTime)}</span>`)}
      ${row(t.howMany, `${esc(countLabel)}, ${esc(span)}`)}
      ${row(t.length, `${input.durationMinutes} ${esc(t.minutes)}`)}
      ${row(t.comingUp, esc(upcoming.join(" · ")) + (moreCount > 0 ? ` <span style="color:#786b60;">${esc(t.more(moreCount))}</span>` : ""))}
      <p style="margin:12px 0 6px 0;font-size:14px;color:#564a42;"><strong>${esc(t.where)}:</strong> ${whereHtml}</p>
      <p style="margin:24px 0 0 0;font-size:14px;line-height:1.6;color:#564a42;">${esc(t.move)}</p>
      <p style="margin:16px 0 0 0;font-size:15px;line-height:1.6;color:#564a42;">${esc(t.warmly)}<br>${esc(signoff)}</p>
    </div>
  </body>
</html>`.trim();

  await sendEmail({ to: input.to, subject: t.subject, html, text, replyTo: input.replyTo });
}

function cadenceShort(lang: Lang, f: Frequency): string {
  if (lang === "uk")
    return f === "weekly" ? "щотижня" : f === "biweekly" ? "раз на два тижні" : "щомісяця";
  return f === "weekly" ? "every week" : f === "biweekly" ? "every two weeks" : "monthly";
}

function ordinalEn(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Ukrainian plural: 1 сесія · 2–4 сесії · 5+ сесій (with the 11–14 exception). */
function ukPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}
