// Observability entry point.
//
// Next.js calls `register()` once when each server instance boots, and
// `onRequestError` for every server-side error — Server Components, Route
// Handlers, AND Server Actions (context.routeType === "action"). We wire both
// to Sentry so a crash, a timed-out external call, or a database error is
// visible and verifiable — which is exactly what we lacked the morning the app
// froze. See node_modules/next/dist/docs/.../instrumentation.md.
//
// Deliberately uses @sentry/node (framework-agnostic) rather than the
// @sentry/nextjs build plugin, so it can't affect this app's (non-standard)
// Next build. Everything is gated on SENTRY_DSN: with no DSN set this is inert,
// so it's safe to ship before the DSN is configured in the environment.

export async function register() {
  // Skip the edge runtime (middleware/proxy) — @sentry/node is Node-only. Skip
  // when there's no DSN so local dev and un-configured deploys stay silent.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.SENTRY_DSN) return;

  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Tie each error to the deploy that produced it.
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // Error monitoring first; no performance tracing yet (turn up later if you
    // want request timings — it adds volume/cost).
    tracesSampleRate: 0,
    // PRIVACY: never attach cookies/headers/user IP or request bodies. This app
    // handles client PII, so we opt OUT of Sentry's default PII collection.
    sendDefaultPii: false,
  });
}

// Server-error hook. Typed loosely on purpose so it doesn't depend on a
// `next`-exported type that may differ in this build.
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routeType?: string; routePath?: string }
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.captureException(err, {
      tags: {
        routeType: context?.routeType,
        routePath: context?.routePath,
      },
      extra: { path: request?.path, method: request?.method },
    });
    // Serverless functions can be frozen right after the response — flush so
    // the event actually leaves before that happens.
    await Sentry.flush(2000);
  } catch {
    // Reporting must never throw inside the error path.
  }
}
