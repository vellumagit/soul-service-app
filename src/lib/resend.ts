// Resend email client — used for both magic-link sign-in emails AND
// outbound client communication from the EmailComposer.
//
// Lazy-init so the app can build/dev before RESEND_API_KEY is set.
import "server-only";

import { Resend } from "resend";

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

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
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
