"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { attachments, clients, sessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession } from "./session-cookies";

function ensureBlobConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "File uploads aren't configured. Add BLOB_READ_WRITE_TOKEN to your environment (Vercel → Storage → Connect Blob)."
    );
  }
}

// Upload an avatar for a client. Replaces previous avatarUrl on the client row.
export async function uploadClientAvatar(formData: FormData) {
  ensureBlobConfigured();
  const { accountId } = await requireSession();
  const clientId = formData.get("clientId");
  const file = formData.get("file");
  if (typeof clientId !== "string" || !clientId)
    throw new Error("Client id required");
  if (!(file instanceof File) || file.size === 0)
    throw new Error("Choose an image first");
  if (!file.type.startsWith("image/"))
    throw new Error("Avatar must be an image");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Avatar must be under 5 MB");

  // Look up the existing avatar URL so we can delete it after the new one
  // uploads. `addRandomSuffix: true` below means each upload generates a NEW
  // Blob with a unique filename — without this cleanup step, every avatar
  // change leaves the previous file orphaned in storage forever.
  const [existing] = await db
    .select({ avatarUrl: clients.avatarUrl })
    .from(clients)
    .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)))
    .limit(1);
  const previousAvatarUrl = existing?.avatarUrl ?? null;

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const blob = await put(`accounts/${accountId}/avatars/${clientId}.${ext}`, file, {
    access: "public",
    addRandomSuffix: true, // avoid CDN cache issues on update
    allowOverwrite: true,
  });

  await db
    .update(clients)
    .set({ avatarUrl: blob.url, updatedAt: new Date() })
    .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)));

  // Best-effort cleanup of the old file. The new URL is already saved, so
  // a failure here just leaves an orphan, not a broken UI.
  if (previousAvatarUrl && previousAvatarUrl !== blob.url) {
    try {
      const { del } = await import("@vercel/blob");
      await del(previousAvatarUrl);
    } catch (e) {
      console.warn("[uploadClientAvatar] couldn't delete previous avatar:", e);
    }
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

// Upload a generic file attached to a client (and optionally a session).
export async function uploadAttachment(formData: FormData) {
  ensureBlobConfigured();
  const { accountId } = await requireSession();
  const clientId = formData.get("clientId");
  const sessionId = formData.get("sessionId");
  const kind = formData.get("kind");
  const file = formData.get("file");
  if (typeof clientId !== "string" || !clientId)
    throw new Error("Client id required");
  if (!(file instanceof File) || file.size === 0)
    throw new Error("Choose a file first");
  if (file.size > 100 * 1024 * 1024)
    throw new Error("File must be under 100 MB");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Bucket files by account so each tenant's Blob storage is isolated.
  const blob = await put(
    `accounts/${accountId}/clients/${clientId}/${Date.now()}_${safeName}`,
    file,
    {
      access: "public",
      addRandomSuffix: false,
    }
  );

  await db.insert(attachments).values({
    accountId,
    clientId,
    sessionId:
      typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null,
    name: file.name,
    kind:
      (kind as
        | "note"
        | "intake"
        | "consent"
        | "recording"
        | "photo"
        | "other"
        | null) ?? "other",
    url: blob.url,
    pathname: blob.pathname,
    sizeBytes: file.size,
    mimeType: file.type || null,
  });

  revalidatePath(`/clients/${clientId}`);
}

/**
 * Voice-memo upload, used by the "From audio" flow on session cards.
 *
 * Unlike `uploadAttachment`, this one:
 *   1. Takes a sessionId (required) and looks up the clientId from it,
 *      so the caller doesn't have to pass both.
 *   2. Forces kind = "recording".
 *   3. Enforces Whisper's 25 MB ceiling (vs. the generic 100 MB) so the
 *      user gets a friendly error before we even hit OpenAI.
 *   4. Returns the public Blob URL so the dialog can immediately post it
 *      to `/api/transcribe`. (`uploadAttachment` is fire-and-forget for
 *      the file-tab UI; voice memos need to chain to the next hop.)
 */
export type UploadVoiceMemoResult =
  | { ok: true; audioUrl: string; attachmentId: string; mimeType: string }
  | { ok: false; error: string };

export async function uploadVoiceMemo(
  formData: FormData
): Promise<UploadVoiceMemoResult> {
  try {
    ensureBlobConfigured();
    const { accountId } = await requireSession();
    const sessionId = formData.get("sessionId");
    const file = formData.get("file");
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return { ok: false, error: "Session id required" };
    }
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "No audio captured." };
    }
    if (file.size > 25 * 1024 * 1024) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      return {
        ok: false,
        error: `Audio is ${mb} MB — Whisper's limit is 25 MB. Trim the file or use a lower bitrate.`,
      };
    }

    // Resolve clientId from the session — scoped to accountId so a
    // wrong-account session id can't pull someone else's row.
    const [sess] = await db
      .select({ clientId: sessions.clientId })
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      )
      .limit(1);
    if (!sess) {
      return { ok: false, error: "Session not found" };
    }
    const clientId = sess.clientId;

    const safeName = (file.name || "memo.webm").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
    const blob = await put(
      `accounts/${accountId}/clients/${clientId}/${Date.now()}_${safeName}`,
      file,
      {
        access: "public",
        addRandomSuffix: false,
      }
    );

    const [row] = await db
      .insert(attachments)
      .values({
        accountId,
        clientId,
        sessionId,
        name: file.name || "Voice memo",
        kind: "recording",
        url: blob.url,
        pathname: blob.pathname,
        sizeBytes: file.size,
        mimeType: file.type || "audio/webm",
      })
      .returning({ id: attachments.id });

    revalidatePath(`/clients/${clientId}`);

    return {
      ok: true,
      audioUrl: blob.url,
      attachmentId: row.id,
      mimeType: file.type || "audio/webm",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}
