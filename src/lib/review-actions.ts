"use server";

// Reviews on the storefront — add, edit, reorder, remove.
//
// A review is ONE row carrying BOTH languages. The photo and the position in
// the list are shared; only the words differ per language. Blank Ukrainian
// text falls back to the English at render time (see landingReviewForLang), so
// she can publish in one language today and translate it next week.
//
// NOTE: every export in a "use server" file is a public POST endpoint. Each one
// below starts with requireSession() and scopes its writes by accountId — a
// helper that skipped that would be an unauthenticated write to her storefront.
// Anything that ISN'T meant to be callable from the browser must stay
// module-local (not exported) — hence the small private helpers here.

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { landingReviews } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireSession } from "./session-cookies";

const MAX_QUOTE = 1200;
const MAX_AUTHOR = 120;

function ensureBlobConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Photo uploads aren't configured. Add BLOB_READ_WRITE_TOKEN to your environment (Vercel → Storage → Connect Blob)."
    );
  }
}

// Only objects we created on Vercel Blob are safe to delete — never a
// hand-pasted external link.
function isVercelBlobUrl(url: string): boolean {
  return url.includes(".public.blob.vercel-storage.com");
}

function str(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
}

/** Both storefront languages plus Settings need refreshing after any change. */
function revalidateStorefront() {
  revalidatePath("/");
  revalidatePath("/settings");
}

// Upload a review photo to Blob and return its URL. Scoped to the review so a
// deleted review's photo is identifiable. Not exported — callers go through
// saveReview, which has already authenticated and verified ownership.
async function storeReviewPhoto(
  accountId: string,
  reviewId: string,
  file: File
): Promise<string> {
  ensureBlobConfigured();
  if (!file.type.startsWith("image/"))
    throw new Error("The photo must be an image (JPG or PNG)");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("The photo must be under 5 MB");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const blob = await put(
    `accounts/${accountId}/reviews/${reviewId}.${ext}`,
    file,
    {
      access: "public",
      addRandomSuffix: true, // new object each change → dodges CDN caching
      allowOverwrite: true,
    }
  );
  return blob.url;
}

// Best-effort removal of a Blob we own. Never throws — losing a stray file is
// not a reason to fail the edit she just made.
async function dropBlob(url: string | null | undefined) {
  if (!url || !isVercelBlobUrl(url)) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(url);
  } catch (e) {
    console.warn("[reviews] couldn't delete previous photo:", e);
  }
}

/**
 * Create or update a review. `id` blank → create.
 *
 * At least one quote (English or Ukrainian) is required — an entirely empty
 * review would render as a pair of quote marks around nothing.
 */
export async function saveReview(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();

  const id = str(formData, "id", 100);
  const quoteEn = str(formData, "quoteEn", MAX_QUOTE);
  const quoteUk = str(formData, "quoteUk", MAX_QUOTE);
  const authorEn = str(formData, "authorEn", MAX_AUTHOR);
  const authorUk = str(formData, "authorUk", MAX_AUTHOR);
  const published = formData.get("published") != null;

  if (!quoteEn && !quoteUk)
    throw new Error("Write the review in at least one language.");

  const photo = formData.get("photo");
  const hasNewPhoto = photo instanceof File && photo.size > 0;

  let reviewId = id;
  let previousPhotoUrl: string | null = null;

  if (id) {
    // Ownership check doubles as the "does it exist" check.
    const [existing] = await db
      .select({ photoUrl: landingReviews.photoUrl })
      .from(landingReviews)
      .where(
        and(
          eq(landingReviews.id, id),
          eq(landingReviews.accountId, accountId)
        )
      )
      .limit(1);
    if (!existing) throw new Error("That review no longer exists.");
    previousPhotoUrl = existing.photoUrl;

    await db
      .update(landingReviews)
      .set({
        quoteEn,
        quoteUk,
        authorEn,
        authorUk,
        published,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(landingReviews.id, id),
          eq(landingReviews.accountId, accountId)
        )
      );
  } else {
    // New reviews land at the end of the list.
    const [last] = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)::int` })
      .from(landingReviews)
      .where(eq(landingReviews.accountId, accountId));

    const [created] = await db
      .insert(landingReviews)
      .values({
        accountId,
        quoteEn,
        quoteUk,
        authorEn,
        authorUk,
        published,
        sortOrder: (last?.max ?? -1) + 1,
      })
      .returning({ id: landingReviews.id });
    reviewId = created.id;
  }

  if (hasNewPhoto) {
    const url = await storeReviewPhoto(accountId, reviewId, photo as File);
    await db
      .update(landingReviews)
      .set({ photoUrl: url, updatedAt: new Date() })
      .where(
        and(
          eq(landingReviews.id, reviewId),
          eq(landingReviews.accountId, accountId)
        )
      );
    if (previousPhotoUrl && previousPhotoUrl !== url)
      await dropBlob(previousPhotoUrl);
  }

  revalidateStorefront();
}

/** Clear a review's photo (back to the initial-letter circle). */
export async function removeReviewPhoto(id: string): Promise<void> {
  const { accountId } = await requireSession();
  const [existing] = await db
    .select({ photoUrl: landingReviews.photoUrl })
    .from(landingReviews)
    .where(
      and(eq(landingReviews.id, id), eq(landingReviews.accountId, accountId))
    )
    .limit(1);
  if (!existing) return;

  await db
    .update(landingReviews)
    .set({ photoUrl: null, updatedAt: new Date() })
    .where(
      and(eq(landingReviews.id, id), eq(landingReviews.accountId, accountId))
    );
  await dropBlob(existing.photoUrl);
  revalidateStorefront();
}

/** Delete a review outright. Use the Published toggle to park one instead. */
export async function deleteReview(id: string): Promise<void> {
  const { accountId } = await requireSession();
  const [existing] = await db
    .select({ photoUrl: landingReviews.photoUrl })
    .from(landingReviews)
    .where(
      and(eq(landingReviews.id, id), eq(landingReviews.accountId, accountId))
    )
    .limit(1);
  if (!existing) return;

  await db
    .delete(landingReviews)
    .where(
      and(eq(landingReviews.id, id), eq(landingReviews.accountId, accountId))
    );
  await dropBlob(existing.photoUrl);
  revalidateStorefront();
}

/**
 * Move a review one place up or down.
 *
 * Swaps sort_order with its neighbour rather than rewriting the whole list, so
 * two quick clicks can't leave the order half-applied. Reads the account's rows
 * in current order and finds the neighbour by position — which also self-heals
 * any duplicate or gapped sort_order values from earlier edits.
 */
export async function moveReview(
  id: string,
  direction: "up" | "down"
): Promise<void> {
  const { accountId } = await requireSession();

  const rows = await db
    .select({ id: landingReviews.id, sortOrder: landingReviews.sortOrder })
    .from(landingReviews)
    .where(eq(landingReviews.accountId, accountId))
    .orderBy(asc(landingReviews.sortOrder), asc(landingReviews.createdAt));

  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return; // already at the end — nothing to do

  // Positional swap: assign each its neighbour's index. Using indexes (not the
  // stored values) normalises any duplicates that crept in.
  await db
    .update(landingReviews)
    .set({ sortOrder: j, updatedAt: new Date() })
    .where(
      and(
        eq(landingReviews.id, rows[i].id),
        eq(landingReviews.accountId, accountId)
      )
    );
  await db
    .update(landingReviews)
    .set({ sortOrder: i, updatedAt: new Date() })
    .where(
      and(
        eq(landingReviews.id, rows[j].id),
        eq(landingReviews.accountId, accountId)
      )
    );

  revalidateStorefront();
}
