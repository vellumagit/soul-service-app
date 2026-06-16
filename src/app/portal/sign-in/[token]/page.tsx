// Magic-link consume endpoint. When a client clicks the link in their
// email, they land here. We atomically claim the token (in
// consumeMagicLink) — successful claim sets the session cookie and bounces
// to /portal. Failed claim (expired, already used, invalid) bounces to
// /portal/sign-in with an error.
//
// Server component, no UI — just a redirect.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  consumeMagicLink,
  setPortalSessionCookie,
} from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export default async function ConsumeMagicLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 8) {
    redirect("/portal/sign-in?error=invalid");
  }

  const result = await consumeMagicLink(token);
  if (!result) {
    // Either expired, consumed, or never existed. The sign-in page
    // surfaces both as "request a fresh one" so we don't reveal which.
    redirect("/portal/sign-in?error=expired");
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");
  await setPortalSessionCookie(result.accountId, result.clientId, {
    ip,
    userAgent,
  });

  redirect("/portal");
}
