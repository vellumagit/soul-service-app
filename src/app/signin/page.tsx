import { redirect } from "next/navigation";
import { getSessionEmail } from "@/lib/session-cookies";
import { isAuthDisabled } from "@/lib/session";
import { getSettings } from "@/db/queries";
import { asLocale, t } from "@/lib/i18n";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;

  // Auth disabled (demo mode) → no point being on this page.
  if (isAuthDisabled()) {
    redirect(from && from.startsWith("/") ? from : "/");
  }

  // If already signed in, bounce to wherever they were headed (or home).
  const existing = await getSessionEmail();
  if (existing) {
    redirect(from && from.startsWith("/") ? from : "/");
  }

  // Single-tenant: read the practitioner's stored UI language so the sign-in
  // screen is shown in her preferred language too.
  const settings = await getSettings();
  const locale = asLocale(settings.uiLanguage);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 rounded-md bg-ink-900 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-flame-500" />
          </div>
          <div className="text-base font-semibold text-ink-900 tracking-tight">
            Soul Service
          </div>
        </div>

        <div className="bg-white border border-ink-200 rounded-lg p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-ink-900 mb-1">
            {t(locale, "signin.title")}
          </h1>
          <p className="text-sm text-ink-500 mb-5">
            {t(locale, "signin.subtitle")}
          </p>

          {error === "invalid" && (
            <div className="mb-4 text-xs rounded-md border border-red-100 bg-red-50 text-red-700 p-3">
              That sign-in link is invalid, expired, or already used. Request a new one below.
            </div>
          )}
          {error === "config" && (
            <div className="mb-4 text-xs rounded-md border border-amber-100 bg-amber-50 text-amber-800 p-3">
              Sign-in isn't configured yet. Set <code className="font-mono">AUTH_SECRET</code>,{" "}
              <code className="font-mono">RESEND_API_KEY</code>, and{" "}
              <code className="font-mono">ALLOWED_EMAILS</code> in your environment.
            </div>
          )}

          <SignInForm locale={locale} />
        </div>

        <p className="text-[11px] text-ink-400 text-center mt-6">
          {t(locale, "signin.tagline")}
        </p>
      </div>
    </div>
  );
}
