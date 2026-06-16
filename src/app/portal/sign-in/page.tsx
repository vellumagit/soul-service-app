// Client portal sign-in.
//
// A small "enter your email" form. Server action looks up a portal-enabled
// client with that email, generates a magic link, emails it via Resend.
// Always returns the success message regardless of whether a match was found
// — anti-enumeration discipline. If you've enrolled the client, they get the
// link; if you haven't (or typo'd their email), they see the same message
// but nothing was sent.

import { headers } from "next/headers";
import { sql, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, practitionerSettings } from "@/db/schema";
import { createMagicLink } from "@/lib/portal-auth";
import { sendPortalMagicLinkEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

async function requestMagicLink(formData: FormData): Promise<void> {
  "use server";
  const emailRaw = formData.get("email");
  if (typeof emailRaw !== "string") return;
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) return;

  // Find a portal-enabled client whose email matches case-insensitively.
  // No accountId filter — portal is global across all practitioner accounts
  // on this deployment. The client_id-to-account binding lives on the row.
  const matches = await db
    .select({
      accountId: clients.accountId,
      id: clients.id,
      fullName: clients.fullName,
      email: clients.email,
    })
    .from(clients)
    .where(
      and(
        eq(clients.portalEnabled, true),
        sql`LOWER(${clients.email}) = ${email}`
      )
    )
    .limit(1);
  const match = matches[0];

  // Anti-enumeration: don't reveal whether the email exists. We always show
  // the same success card. Only DO the side effects when there's a match.
  if (!match) return;

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");
  const cleartext = await createMagicLink(match.accountId, match.id, {
    ip,
    userAgent,
  });

  // Build absolute URL. Prefer the public site URL if configured; fall back
  // to the request's own host header.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`;
  const url = `${base}/portal/sign-in/${cleartext}`;

  const settingsRows = await db
    .select({ practitionerName: practitionerSettings.practitionerName })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, match.accountId))
    .limit(1);

  try {
    await sendPortalMagicLinkEmail({
      to: match.email!,
      url,
      clientFirstName: match.fullName.split(" ")[0] ?? null,
      practitionerName: settingsRows[0]?.practitionerName ?? null,
    });
  } catch (err) {
    console.error("[portal sign-in] sendPortalMagicLinkEmail failed:", err);
    // Still show success — the link row exists; she can resend from her
    // side. Don't leak "your email isn't on file" via an error message.
  }
}

export default async function PortalSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  const sentState = sent === "1";

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--color-app-bg)" }}
    >
      <div className="paper-card paper-card--feature p-8 md:p-10 max-w-md w-full">
        <h1
          className="text-2xl md:text-3xl text-ink-900 serif mb-3"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          Your space
        </h1>
        <p className="text-sm text-ink-600 italic serif-italic mb-6 leading-relaxed">
          A small window into the work you're doing together. Enter your
          email and a sign-in link will land in your inbox.
        </p>

        {sentState ? (
          <div
            className="rounded-md p-4 text-sm leading-relaxed"
            style={{
              background: "var(--color-honey-50)",
              border: "1px solid var(--color-honey-100)",
              color: "var(--color-honey-700)",
            }}
          >
            Check your email. If we have you on file, a sign-in link is on
            its way. It'll expire in 30 minutes.
          </div>
        ) : (
          <form action={requestMagicLinkAndRedirect} className="space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                Email
              </span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                autoFocus
                className="mt-1.5 w-full px-3 py-2.5 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
                placeholder="you@example.com"
              />
            </label>
            <button
              type="submit"
              className="w-full px-4 py-2.5 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
            >
              Send me a link
            </button>
            {error === "expired" && (
              <p className="text-xs text-honey-700 italic">
                That link expired or had already been used. Request a fresh one.
              </p>
            )}
            {error === "invalid" && (
              <p className="text-xs text-honey-700 italic">
                That link wasn't recognized. Request a fresh one.
              </p>
            )}
          </form>
        )}

        <p className="text-[11px] text-ink-400 mt-8 italic leading-relaxed">
          This is a private space between you and your practitioner. No
          public sign-up — access is enabled per-person by them.
        </p>
      </div>
    </div>
  );
}

// Server action wrapper that also redirects to ?sent=1 after the email send
// kicks off. Defining as a separate inner action so the form's action prop
// can use it directly.
async function requestMagicLinkAndRedirect(formData: FormData) {
  "use server";
  await requestMagicLink(formData);
  const { redirect } = await import("next/navigation");
  redirect("/portal/sign-in?sent=1");
}
