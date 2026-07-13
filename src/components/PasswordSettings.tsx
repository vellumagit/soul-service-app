"use client";

// Settings → Sign-in password. Lets the practitioner set (first time) or
// change her app password. Separate from her Google/Workspace password.
// Clients never see this — it's on the authenticated Settings page.

import { useActionState } from "react";
import {
  setPractitionerPassword,
  type PasswordUpdateResult,
} from "@/lib/auth-actions";
import { Field, inputCls } from "@/components/Form";

const initial: PasswordUpdateResult | undefined = undefined;

export function PasswordSettings({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState(
    setPractitionerPassword,
    initial
  );

  return (
    <section className="border border-ink-200 rounded-md bg-white p-5">
      <h2 className="text-sm font-semibold text-ink-900 mb-1">
        Sign-in password
      </h2>
      <p className="text-xs text-ink-500 mb-4 leading-relaxed">
        {hasPassword
          ? "Change the password you use to sign in to this workspace from any device. (This is separate from your Google / email password.)"
          : "Set a password so you can sign in from anywhere with your email + password. You can always fall back to an emailed one-time link. (Separate from your Google / email password.)"}
      </p>

      <form action={action} className="space-y-3 max-w-sm">
        {hasPassword && (
          <Field label="Current password" required>
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className={inputCls}
            />
          </Field>
        )}
        <Field label={hasPassword ? "New password" : "Password"} required>
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            className={inputCls}
          />
        </Field>
        <Field label="Confirm password" required>
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            className={inputCls}
          />
        </Field>

        {state && (
          <div
            className={`text-xs rounded-md border p-3 ${
              state.ok
                ? "bg-green-50 border-green-100 text-green-700"
                : "bg-red-50 border-red-100 text-red-700"
            }`}
          >
            {state.message}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="bg-plum-700 hover:bg-plum-600 text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60 transition"
        >
          {pending
            ? "Saving…"
            : hasPassword
            ? "Change password"
            : "Set password"}
        </button>
      </form>
    </section>
  );
}
