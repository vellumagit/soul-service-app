// Magic-link consume endpoint for the practitioner sign-in. Client (in
// her email) clicks the link → lands here → we atomically claim the token,
// set the 30-day session cookie, redirect to /. Failures bounce back to
// /signin with an error code so she sees a useful message.

import { redirect } from "next/navigation";
import {
  consumeUserMagicLink,
  setSessionCookie,
} from "@/lib/session-cookies";
import { getOrCreateAccount } from "@/lib/account";
import { isAllowed } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ConsumeUserMagicLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 8) {
    redirect("/signin?error=invalid");
  }

  const result = await consumeUserMagicLink(token);
  if (!result) {
    redirect("/signin?error=expired");
  }

  // Re-check the allowlist at consume time — defends against the case
  // where she was removed from ALLOWED_EMAILS between the link being
  // generated and being clicked.
  if (!isAllowed(result.email)) {
    redirect("/signin?error=not-allowed");
  }

  // Ensure the account row exists (it should — was created at link
  // generation — but getOrCreate is idempotent and defends against
  // odd-edge restore-from-backup scenarios).
  try {
    await getOrCreateAccount(result.email);
  } catch (err) {
    console.error("[auth] consume: account bootstrap failed:", err);
    redirect("/signin?error=config");
  }

  await setSessionCookie(result.email);
  redirect("/");
}
