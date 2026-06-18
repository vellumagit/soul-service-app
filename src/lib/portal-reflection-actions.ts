"use server";

// Edit + delete actions for client reflections, called from the
// ReflectionEntry client component. Every action gates on
// requirePortalSession AND scopes the WHERE clause to the
// (accountId, clientId) pair from the session — a client can only
// touch their own reflections, not anyone else's even if they could
// guess a UUID.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientReflections } from "@/db/schema";
import { requirePortalSession } from "./portal-auth";

export type ReflectionResult = { ok: true } | { ok: false; error: string };

export async function updateClientReflection(
  id: string,
  body: string
): Promise<ReflectionResult> {
  try {
    const portal = await requirePortalSession();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: "Reflection can't be empty." };
    }
    const updated = await db
      .update(clientReflections)
      .set({
        body: trimmed.slice(0, 5000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientReflections.accountId, portal.accountId),
          eq(clientReflections.clientId, portal.clientId),
          eq(clientReflections.id, id)
        )
      )
      .returning({ id: clientReflections.id });
    if (updated.length === 0) {
      return { ok: false, error: "Reflection not found." };
    }
    revalidatePath("/portal/reflections");
    revalidatePath(`/clients/${portal.clientId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Couldn't update reflection.",
    };
  }
}

export async function deleteClientReflection(
  id: string
): Promise<ReflectionResult> {
  try {
    const portal = await requirePortalSession();
    const deleted = await db
      .delete(clientReflections)
      .where(
        and(
          eq(clientReflections.accountId, portal.accountId),
          eq(clientReflections.clientId, portal.clientId),
          eq(clientReflections.id, id)
        )
      )
      .returning({ id: clientReflections.id });
    if (deleted.length === 0) {
      return { ok: false, error: "Reflection not found." };
    }
    revalidatePath("/portal/reflections");
    revalidatePath(`/clients/${portal.clientId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Couldn't delete reflection.",
    };
  }
}
