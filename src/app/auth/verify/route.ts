// Magic-link verification endpoint. The user clicks a link in their email
// that points here with `?t=<rawToken>`. We hash + look up the token, mark
// it consumed, set the session cookie, and redirect /.
//
// On any failure → /signin?error=invalid (no detail leaks to the user).
import { NextResponse, type NextRequest } from "next/server";
import { consumeMagicLinkToken } from "@/lib/auth-tokens";
import { setSessionCookie } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const token = url.searchParams.get("t") ?? "";

  try {
    const result = await consumeMagicLinkToken(token);
    if (!result) {
      url.pathname = "/signin";
      url.search = "?error=invalid";
      return NextResponse.redirect(url);
    }

    await setSessionCookie(result.email);
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[auth/verify] error consuming token:", err);
    url.pathname = "/signin";
    url.search = "?error=invalid";
    return NextResponse.redirect(url);
  }
}
