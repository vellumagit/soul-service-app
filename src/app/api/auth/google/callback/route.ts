// OAuth callback. Google redirects here with `?code=...` after consent.
// We exchange the code for tokens, persist them, and bounce back to /settings.
//
// Auth resolution is dual-path so Safari ITP doesn't break the flow:
//
//   1. PRIMARY — the `gcal_oauth_state` first-party cookie that
//      `startGoogleConnect` set just before sending the user to Google. ITP
//      doesn't strip first-party cookies, so this is the reliable path on
//      Safari. The cookie carries the accountId.
//
//   2. FALLBACK — the regular session cookie via `requireSession()`. Used on
//      Chrome/Firefox/etc where ITP isn't an issue, and as a defense in case
//      the state cookie is missing (e.g. older session predating this fix).
//
// In either case we end up with a valid accountId before exchanging the code.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode } from "@/lib/google-calendar";
import { requireSession, getSessionEmail } from "@/lib/session-cookies";
import { isRedirectError } from "@/lib/redirect-error";
import { findAccountByEmail } from "@/lib/account";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

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

  // ── Resolve accountId — ITP-safe state cookie first, session cookie second ─
  let accountId: string | null = null;
  const cookieStore = await cookies();
  const stateAccountId = cookieStore.get("gcal_oauth_state")?.value;
  if (stateAccountId) {
    // Consume the cookie so it can't be replayed. Then verify the accountId
    // matches a real account that ALSO matches the current session — that
    // closes a potential CSRF where someone passes a stranger their state
    // cookie. We require BOTH the state cookie AND an authed session that
    // resolves to the same account.
    cookieStore.delete("gcal_oauth_state");
    const email = await getSessionEmail();
    if (email) {
      const acct = await findAccountByEmail(email);
      if (acct && acct.accountId === stateAccountId) {
        accountId = stateAccountId;
      }
    }
  }

  if (!accountId) {
    // Fallback to the session path. `requireSession` throws NEXT_REDIRECT if
    // there's no email — resolve it OUTSIDE the try/catch below so the
    // framework can process the redirect instead of us catching it and
    // showing "reason=NEXT_REDIRECT" in the settings UI.
    try {
      ({ accountId } = await requireSession());
    } catch (err) {
      if (isRedirectError(err)) throw err;
      return NextResponse.redirect(
        new URL("/settings?google=error&reason=auth_failed", url.origin)
      );
    }
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
