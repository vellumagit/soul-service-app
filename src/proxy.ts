// Route protection + subdomain split. NOTE: this file is `proxy.ts`
// because Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`.
// The exported function is `proxy`, not `middleware`.
//
// Two responsibilities:
//
//   1. Subdomain split. When MARKETING_HOSTNAME + APP_HOSTNAME env vars
//      are set, the storefront lives at one hostname and the workspace +
//      portal live at another. Visitors who land on the wrong hostname
//      get redirected across the split. When the env vars are NOT set
//      (dev, preview deploys), the split is a no-op and everything runs
//      on whatever host the request came in on.
//
//   2. Auth gate. Defense-in-depth on top of requireSession() at the
//      page level. JWT cookie verification + allowlist; if either fails,
//      bounce to /signin with `from=` set so we can redirect back after
//      sign-in.
//
// Build-safety: if AUTH_SECRET is missing, requests pass through.
// requireSession() still gates protected pages individually.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, getEmailFromToken } from "@/lib/session";

// Public routes — anything starting with these prefixes is unprotected.
const PUBLIC_PREFIXES = [
  "/signin",
  "/circles/", // Public group-session sign-up pages — anyone with the link
  "/offerings/", // Public storefront product pages (request-to-buy form)
  "/watch/", // Token-validated playback pages for confirmed purchases
  "/api/auth/", // /api/auth/google/callback (Google Calendar OAuth)
  "/api/cron/", // Vercel Cron endpoints — verified by CRON_SECRET, not session
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

// ─────────────────────────────────────────────────────────────────────
// Subdomain split helpers
// ─────────────────────────────────────────────────────────────────────

// On the marketing hostname (svit.live), ONLY these paths render. Every
// other path 308-redirects to the app hostname's equivalent path. Keep
// this list tight — anything that should be publicly bookmark-able on
// the storefront goes here.
function isMarketingPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    // Public group-session sign-up pages — shareable from emails, render
    // on the storefront host so the URL stays inside the marketing domain.
    pathname.startsWith("/circles/") ||
    // Public storefront video offerings + their watch pages — same model
    // as /circles, shareable from emails.
    pathname.startsWith("/offerings/") ||
    pathname.startsWith("/watch/") ||
    // Server-action POSTs back to / for the landing lead form go through
    // Next's invisible /_actions/* routing — already allowed by the
    // _next exclusion in matcher.
    pathname.startsWith("/_next/")
  );
}

// On the app hostname, "/" redirects based on auth state to wherever
// the user actually belongs: practitioner workspace, client portal, or
// the practitioner sign-in. The MARKETING side never renders the
// workspace UI; that's what the redirect prevents.
function appHomeRedirect(request: NextRequest, hasPractitionerCookie: boolean): NextResponse | null {
  if (request.nextUrl.pathname !== "/") return null;
  const url = request.nextUrl.clone();
  if (hasPractitionerCookie) {
    url.pathname = "/today";
  } else {
    // No practitioner cookie. Bounce to /signin which will redirect to
    // /today on success. (Client-portal cookies live at /portal/* with
    // a different cookie name and don't surface here.)
    url.pathname = "/signin";
  }
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // Strip any :port suffix from the host header so envs like
  // localhost:3000 compare cleanly against MARKETING_HOSTNAME values.
  const hostNoPort = host.split(":")[0].toLowerCase();
  const marketingHost = (process.env.MARKETING_HOSTNAME ?? "")
    .toLowerCase()
    .trim();
  const appHost = (process.env.APP_HOSTNAME ?? "").toLowerCase().trim();

  // ─────────────────────────────────────────────────────────────────
  // Subdomain split (only when both env vars are set — otherwise this
  // is a no-op, which matches dev + preview deploys + the current single-
  // hostname production).
  // ─────────────────────────────────────────────────────────────────
  if (marketingHost && appHost && hostNoPort === marketingHost) {
    // Marketing host: only the storefront paths render here. Everything
    // else moves to the app host with the same path + query.
    if (!isMarketingPath(pathname)) {
      const target = new URL(request.nextUrl.toString());
      target.host = appHost;
      target.port = ""; // strip any port
      target.protocol = "https:";
      return NextResponse.redirect(target, 308);
    }
    // It's a marketing path — let it render. No auth required.
    return NextResponse.next();
  }

  // Build-safety bail-out — without AUTH_SECRET we can't verify anything.
  if (!process.env.AUTH_SECRET) {
    return NextResponse.next();
  }

  // App host (or any single-hostname deploy): "/" routes by auth.
  if (marketingHost && appHost && hostNoPort === appHost) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const email = await getEmailFromToken(token);
    const redirect = appHomeRedirect(request, !!email);
    if (redirect) return redirect;
    // Fall through to the normal auth gate below for everything else.
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
