// Route protection. NOTE: this file is `proxy.ts` because Next.js 16
// renamed the `middleware.ts` convention to `proxy.ts`. The exported
// function is `proxy`, not `middleware`.
//
// Optimistic check: just verify the JWT cookie + allowlist. Pages and
// server actions re-verify via `requireSession()` (which also resolves
// the accountId from the email), so this is defense-in-depth.
//
// Build-safety: if AUTH_SECRET is missing, we let requests through rather
// than crashing. requireSession() will still gate access on protected pages.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, getEmailFromToken } from "@/lib/session";

// Public routes — anything starting with these prefixes is unprotected.
const PUBLIC_PREFIXES = [
  "/signin",
  "/api/auth/", // /api/auth/google/callback (Google Calendar OAuth, coming soon)
];

// Always-allowed paths (regardless of auth)
const PUBLIC_PATHS = new Set<string>([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // Build-safety bail-out — without AUTH_SECRET we can't verify anything.
  // Pages handle their own gates via requireSession().
  if (!process.env.AUTH_SECRET) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const email = await getEmailFromToken(token);

  if (!email) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("from", pathname + (search ?? ""));
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Skip proxy for Next internals + static files.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp|woff|woff2|ttf|otf)$).*)",
  ],
};
