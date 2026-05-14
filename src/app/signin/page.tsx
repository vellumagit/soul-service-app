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
    redirect(from && from.startsWith("/") ? from : "/");
  }

  // No account context yet, so the sign-in page is always in the default
  // locale. Once they sign in, every other page uses their account's
  // uiLanguage setting.
  const locale = DEFAULT_LOCALE;

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

          <SignInForm locale={locale} />
        </div>

        <p className="text-[11px] text-ink-400 text-center mt-6">
          {t(locale, "signin.tagline")}
        </p>
      </div>
    </div>
  );
}
