"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { attachments, clients } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const blob = await put(`avatars/${clientId}.${ext}`, file, {
    access: "public",
    addRandomSuffix: true, // avoid CDN cache issues on update
    allowOverwrite: true,
  });

  await db
    .update(clients)
    .set({ avatarUrl: blob.url, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

// Upload a generic file attached to a client (and optionally a session).
export async function uploadAttachment(formData: FormData) {
  ensureBlobConfigured();
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
  const blob = await put(`clients/${clientId}/${Date.now()}_${safeName}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  await db.insert(attachments).values({
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
