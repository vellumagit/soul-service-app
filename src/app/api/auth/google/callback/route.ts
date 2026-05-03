// OAuth callback. Google redirects here with `?code=...` after consent.
// We exchange the code for tokens, persist them, and bounce back to /settings.
import { NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/google-calendar";

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

  try {
    const { email } = await exchangeGoogleCode(code);
    return NextResponse.redirect(
      new URL(
        `/settings?google=connected&email=${encodeURIComponent(email ?? "")}`,
        url.origin
      )
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "exchange_failed";
    return NextResponse.redirect(
      new URL(
        `/settings?google=error&reason=${encodeURIComponent(msg)}`,
        url.origin
      )
    );
  }
}
