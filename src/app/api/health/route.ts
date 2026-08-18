// Lightweight liveness check that NEVER touches the database.
//
// Point uptime monitors (UptimeRobot, Pingdom, Better Uptime, a status page,
// Vercel monitoring, etc.) at THIS route — not the app root or any page. Every
// page queries Neon, and Neon bills by the second the compute is awake, so a
// monitor pinging a page every few minutes keeps the database awake 24/7 and
// burns the whole compute allowance. This route returns a static 200 with zero
// DB work, so it can be pinged as often as you like for free.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, service: "soul-service" });
}
