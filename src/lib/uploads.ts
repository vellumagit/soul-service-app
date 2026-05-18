"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { attachments, clients } from "@/db/schema";
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
