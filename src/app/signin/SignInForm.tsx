"use client";

import { useActionState } from "react";
import { signInWithEmail, type SignInResult } from "@/lib/auth-actions";
import { Field, inputCls } from "@/components/Form";
import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";

const initialState: SignInResult | undefined = undefined;

export function SignInForm({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const [state, action, pending] = useActionState(signInWithEmail, initialState);

  return (
    <form action={action} className="space-y-4">
      <Field label={t(locale, "signin.emailLabel")} required>
        <input
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          className={inputCls}
        />
      </Field>

      {/* Only show on error — success redirects, never renders here. */}
      {state && !state.ok && (
        <div className="text-xs rounded-md border p-3 bg-red-50 border-red-100 text-red-700">
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-4 py-2.5 rounded-md disabled:opacity-60 transition"
      >
        {pending ? t(locale, "signin.submitting") : t(locale, "signin.submit")}
      </button>

      <p className="text-[11px] text-ink-400 text-center pt-1">
        {t(locale, "signin.helpText")}
      </p>
    </form>
  );
}
