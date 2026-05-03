// Route protection. NOTE: this file is `proxy.ts` because Next.js 16
// renamed the `middleware.ts` convention to `proxy.ts`. The exported
// function is `proxy`, not `middleware`. See:
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// We do an OPTIMISTIC check here: just verify the JWT cookie. Server actions
// and DB-touching pages should re-verify via `requireSession()` from
// session-cookies.ts (defense in depth — see Next 16 docs on Server Functions
// not necessarily being covered by proxy after refactors).
//
// Build-safety: if AUTH_SECRET is missing (e.g. very early dev or first
// build before env vars are set), we let the request through rather than
// crashing. The page-level requireSession() will still gate access.

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  getEmailFromToken,
  isAuthDisabled,
} from "@/lib/session";

// Public routes — anything starting with these prefixes is unprotected.
const PUBLIC_PREFIXES = [
  "/signin",
  "/auth/", // /auth/verify, /auth/check-email, /auth/error
  "/api/auth/", // /api/auth/google/callback (Google Calendar OAuth)
];

// Always-allowed paths (regardless of auth)
const PUBLIC_PATHS = new Set<string>(["/favicon.ico", "/robots.txt", "/sitemap.xml"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // Kill-switch: when AUTH_DISABLED=true (or AUTH_SECRET is unset), skip every
  // check and let the request through. Lets you ship the app for a demo before
  // sign-in is fully configured.
  if (isAuthDisabled()) {
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

  // Pass the email downstream as a header so server components can read it
  // without re-decrypting (they still verify via session-cookies for security).
  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });
  return response;
}

// Skip proxy for Next internals + image opt + static files.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp|woff|woff2|ttf|otf)$).*)",
  ],
};
