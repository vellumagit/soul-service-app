"use client";

import { useActionState } from "react";
import { signInWithEmail, type SignInResult } from "@/lib/auth-actions";
import { Field, inputCls } from "@/components/Form";
import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";

const initialState: SignInResult | undefined = undefined;

export function SignInForm({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const [state, action, pending] = useActionState(signInWithEmail, initialState);

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
        {pending ? "Sending link…" : "Send sign-in link"}
      </button>

      <p className="text-[11px] text-ink-400 text-center pt-1">
        We&apos;ll email a single-use link. It expires in 30 minutes.
      </p>
    </form>
  );
}
