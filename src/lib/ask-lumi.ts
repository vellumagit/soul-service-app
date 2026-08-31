// Open Lumi (the corner helper) from anywhere in the app — optionally with a
// question already typed into her input, so a button like "Ask Lumi" can drop
// the practitioner straight into a relevant conversation instead of a blank one.
//
// HelpBuddy listens for this event and opens itself; keeping the wiring in one
// tiny module means callers don't hand-roll CustomEvents and the event name
// can't drift between sender and listener.

export const LUMI_OPEN_EVENT = "lumi:open";

export type LumiOpenDetail = { prompt?: string };

/** Open Lumi. Pass a `prompt` to pre-fill her input (she can edit before sending). */
export function askLumi(prompt?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LumiOpenDetail>(LUMI_OPEN_EVENT, { detail: { prompt } })
  );
}
