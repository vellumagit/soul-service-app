"use client";

import { useActionState } from "react";
import { requestMagicLink, type RequestMagicLinkResult } from "@/lib/auth-actions";
import { Field, inputCls } from "@/components/Form";

const initialState: RequestMagicLinkResult | undefined = undefined;

export function SignInForm() {
  const [state, action, pending] = useActionState(requestMagicLink, initialState);

  return (
    <form action={action} className="space-y-4">
      <Field label="Email" required>
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

      {state && (
        <div
          className={`text-xs rounded-md border p-3 ${
            state.ok
              ? "bg-green-50 border-green-100 text-green-800"
              : "bg-red-50 border-red-100 text-red-700"
          }`}
        >
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-4 py-2.5 rounded-md disabled:opacity-60 transition"
      >
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </button>

      <p className="text-[11px] text-ink-400 text-center pt-1">
        We'll email a one-time link that signs you in. It expires in 15 minutes.
      </p>
    </form>
  );
}
