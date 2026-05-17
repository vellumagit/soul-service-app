import type { NextConfig } from "next";
import path from "node:path";

// Why deploymentId:
//
// Server actions (createClient, scheduleSession, etc.) are referenced by a
// hashed ID baked into the client JS bundle. When we ship a new deploy, those
// hashes can change. A user with a long-lived browser tab still has the OLD
// bundle in memory — when they click "Add client" their tab POSTs to an
// action ID the new server doesn't recognize, and Next.js returns 404.
//
// Symptom Svitlana actually hit: filled in a new-client form, clicked Save,
// got "404 page not found" on what looked like a /clients/<id> URL. The 404
// was Next.js failing to resolve her stale tab's stale server action against
// the freshly-deployed build, not anything wrong with the action or the page.
//
// Fix: set a per-deploy ID. Next.js then:
//   - tags every static asset URL with ?dpl=<id>
//   - includes the ID in navigation headers
//   - triggers a full page reload (hard nav) when client/server IDs diverge
//
// VERCEL_DEPLOYMENT_ID is set automatically on every Vercel deploy, so this
// just works in prod. Falls back to undefined locally (skew protection is a
// no-op for dev — you're on one bundle anyway).
const nextConfig: NextConfig = {
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
