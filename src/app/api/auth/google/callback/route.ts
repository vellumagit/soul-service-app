// OAuth callback. Google redirects here with `?code=...` after consent.
// We exchange the code for tokens, persist them, and bounce back to /settings.
import { NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/google-calendar";
import { requireSession } from "@/lib/session-cookies";
import { isRedirectError } from "@/lib/redirect-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // User denied / aborted
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/settings?google=error&reason=${encodeURIComponent(error)}`,
        url.origin
      )
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?google=error&reason=no_code", url.origin)
    );
  }

  // requireSession() throws NEXT_REDIRECT if the cookie's been invalidated
  // (e.g. she signed out in another tab between starting OAuth and Google
  // bouncing her back). Resolve it BEFORE the try/catch so the framework can
  // process the redirect instead of us catching it and showing
  // "reason=NEXT_REDIRECT" in the settings UI.
  let accountId: string;
  try {
    ({ accountId } = await requireSession());
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return NextResponse.redirect(
      new URL("/settings?google=error&reason=auth_failed", url.origin)
    );
  }

  try {
    const { email } = await exchangeGoogleCode(code, accountId);
    return NextResponse.redirect(
      new URL(
        `/settings?google=connected&email=${encodeURIComponent(email ?? "")}`,
        url.origin
      )
    );
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "exchange_failed";
    return NextResponse.redirect(
      new URL(
        `/settings?google=error&reason=${encodeURIComponent(msg)}`,
        url.origin
      )
    );
  }
}
