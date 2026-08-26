"use client";

import { useActionState, useState } from "react";
import { signInWithEmail, type SignInResult } from "@/lib/auth-actions";
import { Field, inputCls } from "@/components/Form";
import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";

const initialState: SignInResult | undefined = undefined;

export function SignInForm({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const [state, action, pending] = useActionState(signInWithEmail, initialState);
  const [showPw, setShowPw] = useState(false);

  // Success no longer redirects — we now email a magic link and render
  // a "check your email" card in place. This is the anti-enumeration
  // path: same card whether the email was allowlisted or not.
  if (state?.ok) {
    return (
      <div
        className="rounded-md p-4 text-sm leading-relaxed"
        style={{
          background: "var(--color-honey-50)",
          border: "1px solid var(--color-honey-100)",
          color: "var(--color-honey-700)",
        }}
      >
        <p className="font-medium mb-1.5">Check your email.</p>
        <p>{state.message}</p>
      </div>
    );
  }

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

      <Field label="Password">
        <div className="relative">
          <input
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            className={`${inputCls} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Hide password" : "Show password"}
            title={showPw ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-700"
          >
            {showPw ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.774 3.162 10.066 7.498a10.52 10.52 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            )}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="text-[11px] text-ink-400 leading-relaxed">
            Have a password? Enter it — or use a sign-in link.
          </p>
          <button
            type="submit"
            name="intent"
            value="link"
            disabled={pending}
            className="text-[11px] text-plum-700 hover:underline whitespace-nowrap disabled:opacity-60"
          >
            Forgot your password?
          </button>
        </div>
      </Field>

      {state && !state.ok && (
        <div className="text-xs rounded-md border p-3 bg-red-50 border-red-100 text-red-700">
          {state.message}
        </div>
      )}

      {/* Primary: password sign-in (intent=password). */}
      <button
        type="submit"
        name="intent"
        value="password"
        disabled={pending}
        className="w-full bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-4 py-2.5 rounded-md disabled:opacity-60 transition"
      >
        {pending ? t(locale, "signin.submitting") : t(locale, "signin.submit")}
      </button>

      {/* Fallback / reset: always emails a one-time link (intent=link). */}
      <button
        type="submit"
        name="intent"
        value="link"
        disabled={pending}
        className="w-full border border-ink-200 bg-white hover:bg-ink-50 text-ink-700 text-sm font-medium px-4 py-2.5 rounded-md disabled:opacity-60 transition"
      >
        Email me a sign-in link
      </button>

      <p className="text-[11px] text-ink-400 text-center pt-1">
        {t(locale, "signin.helpText")}
      </p>
    </form>
  );
}
