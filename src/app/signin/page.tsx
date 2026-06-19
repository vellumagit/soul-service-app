import { redirect } from "next/navigation";
import { getSessionEmail } from "@/lib/session-cookies";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;

  // If already signed in, bounce to wherever they were headed (or home).
  const existing = await getSessionEmail();
  if (existing) {
    redirect(from && from.startsWith("/") ? from : "/today");
  }

  // No account context yet, so the sign-in page is always in the default
  // locale. Once they sign in, every other page uses their account's
  // uiLanguage setting.
  const locale = DEFAULT_LOCALE;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, var(--color-plum-50) 0%, var(--color-app-bg) 60%)",
      }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, var(--color-parchment) 0%, var(--color-parchment-edge) 100%)",
              boxShadow:
                "inset 0 0 0 1px var(--color-honey-300), 0 2px 8px rgba(80, 50, 70, 0.08)",
            }}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-plum-500 shadow-sm" />
          </div>
          <div
            className="text-xl text-ink-900 serif"
            style={{ fontWeight: 500, letterSpacing: "-0.01em" }}
          >
            Soul Service
          </div>
        </div>

        <div className="paper-card p-6">
          <h1 className="text-lg font-semibold text-ink-900 mb-1">
            {t(locale, "signin.title")}
          </h1>
          <p className="text-sm text-ink-500 mb-5">
            {t(locale, "signin.subtitle")}
          </p>

          {error === "missing-account" && (
            <div className="mb-4 text-xs rounded-md border border-amber-100 bg-amber-50 text-amber-800 p-3">
              Your session was valid but your account couldn&apos;t be found.
              Sign in again to recreate it.
            </div>
          )}
          {error === "config" && (
            <div className="mb-4 text-xs rounded-md border border-amber-100 bg-amber-50 text-amber-800 p-3">
              Sign-in isn&apos;t configured yet. Set{" "}
              <code className="font-mono">AUTH_SECRET</code> and{" "}
              <code className="font-mono">ALLOWED_EMAILS</code> in your environment.
            </div>
          )}
          {(error === "expired" || error === "invalid") && (
            <div className="mb-4 text-xs rounded-md border border-amber-100 bg-amber-50 text-amber-800 p-3">
              That sign-in link expired or had already been used. Request a fresh one below.
            </div>
          )}
          {error === "not-allowed" && (
            <div className="mb-4 text-xs rounded-md border border-amber-100 bg-amber-50 text-amber-800 p-3">
              This email is no longer on the access list. Reach out to the admin if that&apos;s a mistake.
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
