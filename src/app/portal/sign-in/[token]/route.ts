// Magic-link consume endpoint for the client portal.
//
// HAS to be a Route Handler, NOT a Server Component page. Next.js 16's
// cookies() API is read-only inside Server Components; calling .set()
// there throws at request time and the user sees a generic 500. Route
// handlers can write cookies via cookies().set() OR via the response
// object's `cookies.set`. We use the response form so the cookie lands
// on the redirect itself.

import { NextResponse, type NextRequest } from "next/server";
import {
  consumeMagicLink,
  generateSessionCookieValue,
  hashToken,
  SESSION_TTL_DAYS,
} from "@/lib/portal-auth";
import { db } from "@/db";
import { clientPortalSessions } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || token.length < 8) {
    return NextResponse.redirect(
      new URL("/portal/sign-in?error=invalid", req.url)
    );
  }

  const result = await consumeMagicLink(token);
  if (!result) {
    return NextResponse.redirect(
      new URL("/portal/sign-in?error=expired", req.url)
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  // Mint the session cookie + persist the server-side row in one round
  // trip. We inline the work (instead of calling setPortalSessionCookie)
  // so we can attach the cookie to the redirect response, which is the
  // route-handler-safe way to do this. setPortalSessionCookie uses
  // cookies().set() which is fine inside Route Handlers too — but the
  // response form keeps everything in one place and avoids cookies() vs
  // response-cookies precedence ambiguity on the redirect.
  const cleartext = generateSessionCookieValue();
  const cookieHash = hashToken(cleartext);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  await db.insert(clientPortalSessions).values({
    accountId: result.accountId,
    clientId: result.clientId,
    cookieHash,
    expiresAt,
    createdIp: ip,
    createdUserAgent: userAgent,
  });

  const response = NextResponse.redirect(new URL("/portal", req.url));
  response.cookies.set("sps_client", cleartext, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return response;
}
