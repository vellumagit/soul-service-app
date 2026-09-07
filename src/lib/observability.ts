import "server-only";

// Report a best-effort / swallowed error to Sentry so it's still VISIBLE even
// though the caller intentionally doesn't rethrow (booking still succeeds, the
// cron keeps going, etc.). Next's onRequestError only sees UNCAUGHT errors, so
// this is how a timed-out Google/Recall call or a failed email surfaces for
// diagnosis. Gated on SENTRY_DSN and never throws — reporting an error must not
// itself break the flow that swallowed it.
export async function reportError(
  err: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.captureException(err, context ? { extra: context } : undefined);
    await Sentry.flush(2000);
  } catch {
    // Swallow — observability must never cascade into a new failure.
  }
}
