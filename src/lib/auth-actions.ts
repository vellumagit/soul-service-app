"use server";

// Email-as-auth: the user types their email, we check the allowlist,
// find-or-create their account, set the cookie, redirect.
//
// This is deliberately permissive — anyone who knows an allowlisted email
// can sign in. That's the tradeoff the practitioner accepted for simplicity.
// "Elaborate on auth one day."

import { redirect } from "next/navigation";
import { isAllowed } from "./session";
import { setSessionCookie, clearSessionCookie } from "./session-cookies";
import { getOrCreateAccount } from "./account";

export type SignInResult = {
  ok: boolean;
  message: string;
};

/**
 * Submitted by the /signin form. Checks allowlist, bootstraps account if new,
 * sets session cookie, redirects home. Returns an error state if blocked.
 */
export async function signInWithEmail(
  _prev: SignInResult | undefined,
  formData: FormData
): Promise<SignInResult> {
  const rawEmail = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!rawEmail || !rawEmail.includes("@")) {
    return { ok: false, message: "Please enter a valid email address." };
  }

  if (!isAllowed(rawEmail)) {
    console.log(`[auth] rejected sign-in for non-allowlisted: ${rawEmail}`);
    return {
      ok: false,
      message:
        "This email isn't on the access list. If that's a mistake, ask the admin to add it.",
    };
  }

  try {
    await getOrCreateAccount(rawEmail);
  } catch (err) {
    console.error("[auth] account bootstrap failed:", err);
    return {
      ok: false,
      message: "We couldn't set up your account just now. Try again in a moment.",
    };
  }

  await setSessionCookie(rawEmail);
  redirect("/");
}

/** Sign out — clear the cookie and bounce to /signin. */
export async function signOutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/signin");
}
