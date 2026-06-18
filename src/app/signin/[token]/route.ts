// Magic-link consume endpoint for the PRACTITIONER sign-in (Svit / Brian).
//
// Same Route-Handler-not-Server-Component pattern as the portal consume:
// Next.js 16's cookies() API is read-only inside Server Components, so
// the old page.tsx form threw a 500 the moment .set() was called. Route
// handlers can set cookies via the response object cleanly.
//
// Currently dormant unless AUTH_REQUIRE_MAGIC_LINK env var is true, but
// fixed here so it's safe to flip on later.

import { NextResponse, type NextRequest } from "next/server";
import {
  consumeUserMagicLink,
} from "@/lib/session-cookies";
import { getOrCreateAccount } from "@/lib/account";
import { isAllowed, SESSION_COOKIE_NAME, SESSION_DAYS, signSessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || token.length < 8) {
    return NextResponse.redirect(new URL("/signin?error=invalid", req.url));
  }

  const result = await consumeUserMagicLink(token);
  if (!result) {
    return NextResponse.redirect(new URL("/signin?error=expired", req.url));
  }

  // Re-check the allowlist at consume time — defends against the email
  // being removed between link send and click.
  if (!isAllowed(result.email)) {
    return NextResponse.redirect(
      new URL("/signin?error=not-allowed", req.url)
    );
  }

  // Idempotent account bootstrap — should already exist from the
  // requestMagicLink step but defends against the restore-from-backup
  // edge case.
  try {
    await getOrCreateAccount(result.email);
  } catch (err) {
    console.error("[auth] consume: account bootstrap failed:", err);
    return NextResponse.redirect(new URL("/signin?error=config", req.url));
  }

  // Mint the JWT-based session token and attach as a cookie on the
  // redirect response. Same shape as setSessionCookie but written
  // directly to NextResponse so it lands on the redirect.
  const sessionToken = await signSessionToken(result.email);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const response = NextResponse.redirect(new URL("/", req.url));
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires,
    path: "/",
  });
  return response;
}
