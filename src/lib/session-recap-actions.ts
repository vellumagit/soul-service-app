"use server";

// Recap-video server actions. Three flows:
//
//   1. createRecapUpload(sessionId) — Svit clicks "Add recap video" →
//      we call Cloudflare for a direct upload URL, save the UID on the
//      session as "pending," and return { uploadURL, uid } to the
//      browser.
//   2. Browser POSTs the file to uploadURL (Cloudflare's edge — not us).
//   3. confirmRecapUpload(sessionId) — Svit's browser calls this once
//      the upload completes. We fetch video details from Cloudflare,
//      backfill duration, mark the upload timestamp.
//
// removeRecapVideo deletes from Cloudflare too — no orphaned bills.
// getPlaybackUrlForSession mints a 24h signed URL each call (cheap, ~1
// API hit per page render).

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { requireSession } from "./session-cookies";
import * as Stream from "./cloudflare-stream";

// ─────────────────────────────────────────────────────────────────────
// Practitioner — create the upload URL
// ─────────────────────────────────────────────────────────────────────

export type CreateRecapUploadResult =
  | { ok: true; uploadURL: string; uid: string }
  | { ok: false; error: string };

export async function createRecapUpload(
  sessionId: string
): Promise<CreateRecapUploadResult> {
  try {
    if (!Stream.isConfigured()) {
      return {
        ok: false,
        error:
          "Video hosting isn't set up yet. Ask Brian to add the Cloudflare credentials.",
      };
    }
    const { accountId } = await requireSession();
    const [row] = await db
      .select({
        id: sessions.id,
        clientId: sessions.clientId,
        existingId: sessions.recapVideoId,
      })
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .limit(1);
    if (!row) return { ok: false, error: "Session not found." };

    // If there's already a video here, kill the old one first — no orphans.
    if (row.existingId) {
      try {
        await Stream.deleteVideo(row.existingId);
      } catch (err) {
        console.warn("[recap] could not delete old video", err);
      }
    }

    const { uploadURL, uid } = await Stream.createDirectUpload({
      meta: { sessionId, clientId: row.clientId, kind: "recap" },
      requireSignedURLs: true,
    });

    // Stash the UID immediately so we never lose track of a partial upload.
    await db
      .update(sessions)
      .set({
        recapVideoId: uid,
        recapVideoUploadedAt: null,
        recapVideoDurationSeconds: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      );

    return { ok: true, uploadURL, uid };
  } catch (err) {
    console.error("[recap] createRecapUpload failed", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not start upload. Try again.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Practitioner — called by the browser after the file POST completes
// ─────────────────────────────────────────────────────────────────────

export type ConfirmRecapResult =
  | { ok: true; readyToStream: boolean; durationSeconds: number | null }
  | { ok: false; error: string };

export async function confirmRecapUpload(
  sessionId: string
): Promise<ConfirmRecapResult> {
  try {
    const { accountId } = await requireSession();
    const [row] = await db
      .select({
        uid: sessions.recapVideoId,
        clientId: sessions.clientId,
      })
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .limit(1);
    if (!row || !row.uid) {
      return { ok: false, error: "No upload in progress for this session." };
    }
    const details = await Stream.getVideoDetails(row.uid);
    if (!details) {
      // Cloudflare doesn't know about it — the upload never landed.
      await db
        .update(sessions)
        .set({
          recapVideoId: null,
          recapVideoUploadedAt: null,
          recapVideoDurationSeconds: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
        );
      return { ok: false, error: "Upload didn't complete. Try again." };
    }
    await db
      .update(sessions)
      .set({
        recapVideoUploadedAt: new Date(),
        recapVideoDurationSeconds: details.durationSeconds,
        updatedAt: new Date(),
      })
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      );
    revalidatePath(`/clients/${row.clientId}`);
    revalidatePath(`/portal/sessions/${sessionId}`);
    return {
      ok: true,
      readyToStream: details.readyToStream,
      durationSeconds: details.durationSeconds,
    };
  } catch (err) {
    console.error("[recap] confirmRecapUpload failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not confirm upload.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Practitioner — remove the recap
// ─────────────────────────────────────────────────────────────────────

export async function removeRecapVideo(
  sessionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const [row] = await db
      .select({ uid: sessions.recapVideoId, clientId: sessions.clientId })
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .limit(1);
    if (!row) return { ok: false, error: "Session not found." };
    if (row.uid) {
      try {
        await Stream.deleteVideo(row.uid);
      } catch (err) {
        console.warn("[recap] delete from Cloudflare failed (continuing)", err);
      }
    }
    await db
      .update(sessions)
      .set({
        recapVideoId: null,
        recapVideoUploadedAt: null,
        recapVideoDurationSeconds: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      );
    revalidatePath(`/clients/${row.clientId}`);
    revalidatePath(`/portal/sessions/${sessionId}`);
    return { ok: true };
  } catch (err) {
    console.error("[recap] removeRecapVideo failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not remove video.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Signed playback URL for the session — called from server components
// ─────────────────────────────────────────────────────────────────────

/**
 * Returns a signed iframe URL for the recap on the given session. Caller
 * is responsible for auth — this fn doesn't gate by client vs practitioner.
 * Use from the practitioner's session card (after requireSession) and from
 * /portal/sessions/[id] (after requirePortalSession). Returns null if no
 * recap or Cloudflare isn't configured.
 */
export async function getRecapPlaybackUrl(
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
