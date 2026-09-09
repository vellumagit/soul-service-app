// Which deploy is RUNNING. UpdateBeacon compares this against the sha baked
// into the page's bundle (NEXT_PUBLIC_BUILD_SHA, set in next.config.ts) to
// detect a home-screen app or tab that resumed on an older build. No DB, no
// auth, never cached — and listed as a public path in proxy.ts.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
