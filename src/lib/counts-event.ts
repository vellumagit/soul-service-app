// The sidebar badges (Requests, Inbox) only refetched on route change, so
// clearing every request on /requests left the honey "3" beside the nav
// until she navigated away. Any action that changes who is waiting on her
// calls bumpCounts(); the badges listen and refetch.

export const COUNTS_EVENT = "app:counts-changed";

export function bumpCounts() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COUNTS_EVENT));
}
