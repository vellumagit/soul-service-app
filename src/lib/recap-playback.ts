// Minting a signed recap playback URL.
//
// This lives in its own `server-only` module — NOT in session-recap-actions.ts
// — on purpose. That file is `"use server"`, which publishes every export as a
// POST endpoint anyone on the internet can invoke. The mint used to live there
// taking a raw Cloudflare video UID, so a caller who guessed or scraped a UID
// could ask the app to sign a playback URL for it with no auth at all. Here
// there is no endpoint: only server code that imports this can call it.
//
// Callers must still do their own ownership check (requireSession /
// requirePortalSession + a scoped query) before handing us a UID.

import "server-only";

import * as Stream from "./cloudflare-stream";

/** Signed 24h iframe URL for a recap, or null if there's no video / Stream
 *  isn't configured. A fresh URL is minted on every page render, so a copied
 *  iframe stops working overnight. */
export async function mintRecapPlaybackUrl(
  recapVideoId: string | null
): Promise<string | null> {
  if (!recapVideoId) return null;
  if (!Stream.isConfigured()) return null;
  try {
    return await Stream.getSignedPlaybackIframeUrl(recapVideoId);
  } catch (err) {
    console.warn("[recap] signed url mint failed", err);
    return null;
  }
}
