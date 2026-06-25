// Route protection. NOTE: this file is `proxy.ts` because Next.js 16
// renamed the `middleware.ts` convention to `proxy.ts`. The exported
// function is `proxy`, not `middleware`.
//
// Single responsibility: gate the practitioner workspace behind auth.
// Everything public passes through untouched:
//   - the marketing homepage at "/" (ALWAYS public — never depends on an
//     env var to be reachable; this is what makes svit.live land on the
//     storefront every time)
//   - storefront sign-up pages (/circles, /offerings, /watch)
//   - the client portal (/portal/*), which gates ITSELF at the page level
//     via requirePortalSession — the practitioner auth gate must not apply
//   - /signin and the OAuth/cron API routes
//
// Anything not public requires a valid practitioner session cookie; if it's
// missing we bounce to /signin with `from=` so we can return after sign-in.
//
// Build-safety: if AUTH_SECRET is missing, requests pass through and pages
// gate themselves via requireSession().

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, getEmailFromToken } from "@/lib/session";

// Anything under these prefixes is public (no practitioner auth required).
const PUBLIC_PREFIXES = [
  "/signin",
  "/portal", // client portal — gates itself via requirePortalSession
  "/circles/", // public group-session sign-up pages
  "/offerings/", // public storefront product pages
  "/watch/", // token-validated playback pages for confirmed purchases
  "/api/auth/", // /api/auth/google/callback (Google Calendar OAuth)
  "/api/cron/", // Vercel Cron endpoints — verified by CRON_SECRET, not session
];

// Exact public paths.
const PUBLIC_PATHS = new Set<string>([
  "/", // marketing homepage — ALWAYS public
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

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Without AUTH_SECRET we can't verify anything — let pages gate
  // themselves via requireSession().
  if (!process.env.AUTH_SECRET) {
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
