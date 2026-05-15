// Detect Next.js redirect() errors so we don't accidentally swallow them
// inside try/catch around server actions.
//
// Next throws a special error from redirect() that the framework then
// converts into an actual navigation. If user code catches that error and
// shows it as "Something went wrong", the redirect never happens and the
// user sees a dud button.
//
// The official `isRedirectError` lives at an internal path
// (next/dist/client/components/redirect-error) so we don't import it.
// Instead we check the `digest` shape — same signature Next uses
// internally, stable across versions.

export function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Use inside try/catch around a server action that might call redirect().
 * Re-throws the error iff it's a Next redirect — otherwise no-op. Lets your
 * catch block handle real errors but lets navigations through.
 *
 * Pattern:
 *   try {
 *     await someAction(fd);
 *   } catch (err) {
 *     rethrowIfRedirect(err);
 *     setError(err instanceof Error ? err.message : "Failed");
 *   }
 */
export function rethrowIfRedirect(err: unknown): void {
  if (isRedirectError(err)) throw err;
}
