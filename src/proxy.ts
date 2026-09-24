// Route protection. NOTE: this file is `proxy.ts` because Next.js 16
// renamed the `middleware.ts` convention to `proxy.ts`. The exported
// function is `proxy`, not `middleware`.
//
// Two jobs: route the bilingual storefront (/uk/* → Ukrainian, see
// routeStorefront below) and gate the practitioner workspace behind auth.
// Everything public passes through the auth gate untouched:
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
import {
  CANONICAL_ORIGIN,
  LANG_COOKIE,
  LANG_HEADER,
  isLocalizedPath,
  localePath,
  splitLocale,
} from "@/lib/storefront-seo";

// Anything under these prefixes is public (no practitioner auth required).
const PUBLIC_PREFIXES = [
  "/signin",
  "/portal", // client portal — gates itself via requirePortalSession
  "/circles/", // public group-session sign-up pages
  "/free/", // public lead-magnet opt-in pages (email-gated free resources)
  "/api/auth/", // /api/auth/google/callback (Google Calendar OAuth)
  "/api/cron/", // Vercel Cron endpoints — verified by CRON_SECRET, not session
  "/api/webhooks/", // Stripe + Recall webhooks — verified by their own signatures
  "/api/leads/", // external lead intake — verified by per-form Bearer token
];

// Exact public paths.
const PUBLIC_PATHS = new Set<string>([
  "/", // marketing homepage — ALWAYS public
  "/quiz", // public self-selection quiz (lead magnet) — no auth
  "/privacy", // Privacy Policy — must be readable by anyone
  "/terms", // Terms of Service — must be readable by anyone
  "/api/health", // DB-free liveness probe — point uptime monitors here
  "/api/version", // running deploy sha — UpdateBeacon polls it, no auth
  "/manifest.webmanifest", // PWA install manifest — fetched without cookies
  "/sw.js", // service worker — must never be redirected to /signin
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

// The storefront's one public home. app.svit.live serves the same deployment,
// so its storefront pages 308 here — otherwise Google sees two copies of every
// page. Only the bilingual storefront pages move; sign-in, the workspace and
// the portal keep working on whichever host she uses.
const CANONICAL_HOST = new URL(CANONICAL_ORIGIN).host;
const ALIAS_HOSTS = new Set(["app.svit.live"]);

/**
 * Bilingual storefront routing (see storefront-seo.ts):
 *   /uk/*  → rewritten onto the shared page with the language header "uk",
 *            and the choice remembered in the landing_lang cookie.
 *   /*     → English; but a visitor whose cookie says "uk" is sent to /uk/*
 *            so a returning Ukrainian reader still lands in Ukrainian.
 * Returns null for anything that isn't a storefront page.
 */
function routeStorefront(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const { lang, path } = splitLocale(pathname);
  if (!isLocalizedPath(path)) {
    // /uk/<something that isn't bilingual> has no page — let Next 404 it
    // rather than bouncing a visitor to /signin.
    return lang === "uk" ? NextResponse.next() : null;
  }

  const host = request.headers.get("host") ?? "";
  if (ALIAS_HOSTS.has(host) && request.method === "GET") {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = "https";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LANG_HEADER, lang);

  if (lang === "uk") {
    const url = request.nextUrl.clone();
    url.pathname = path;
    const res = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
    if (request.cookies.get(LANG_COOKIE)?.value !== "uk") {
      res.cookies.set(LANG_COOKIE, "uk", {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return res;
  }

  if (
    request.method === "GET" &&
    request.cookies.get(LANG_COOKIE)?.value === "uk"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = localePath("uk", path);
    return NextResponse.redirect(url, 307);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  const storefront = routeStorefront(request);
  if (storefront) return storefront;

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
