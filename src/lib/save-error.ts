"use client";

// Translate a raw thrown error from a server action / fetch call into a
// human-friendly message for the form's error chip — and detect offline /
// network failures specifically, so we can reassure the user that her draft
// is safe locally rather than scaring her with "Failed to fetch."
//
// React 19 server actions surface network failures as the literal browser
// fetch error, which is one of these phrases depending on engine:
//   "Failed to fetch"               (Chrome / Edge)
//   "NetworkError when attempting to fetch resource" (Firefox)
//   "Load failed"                   (Safari)
//   "The Internet connection appears to be offline." (Safari, sometimes)

const NETWORK_PHRASES = [
  "failed to fetch",
  "networkerror",
  "load failed",
  "connection appears to be offline",
  "network request failed",
];

function isNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_PHRASES.some((p) => lower.includes(p));
}

export type SaveErrorInfo = {
  /** Short message shown in the inline error chip. */
  message: string;
  /** True if we think the user is offline — copy in the UI should reassure
   *  rather than alarm. The autosave layer means her work isn't lost. */
  offline: boolean;
};

/**
 * Turn whatever `catch (err)` got into something we can show. Defaults to
 * the error message; reframes network errors so they say "you're offline,
 * your draft is safe."
 */
export function describeSaveError(err: unknown): SaveErrorInfo {
  const raw = err instanceof Error ? err.message : String(err);
  if (isNetworkError(raw)) {
    return {
      message:
        "You're offline. Your typing is saved locally — try again once you're back online.",
      offline: true,
    };
  }
  // Trim long stack traces / framework noise; keep first 200 chars.
  return {
    message: raw.slice(0, 200),
    offline: false,
  };
}
