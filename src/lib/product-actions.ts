"use server";

// Server actions for storefront video products (paid replays, workshops,
// recorded courses).
//
// Two audiences:
//   - Practitioner (createProduct, scheduleProductUpload, confirmPurchase,
//     refundPurchase, etc.) — all gated by requireSession.
//   - Public (requestProductPurchase) — no auth, honeypot + rate limit,
//     creates a row in product_purchases as pending and emails Svit.
//
// Watch link: when she confirms + marks paid, we send the buyer an email
// with /watch/[purchaseId]?token=ACCESS_TOKEN. The watch page validates
// the token against the row; the playback URL is a signed Cloudflare URL
// minted on every page render with a 24h expiry.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { products, productPurchases } from "@/db/schema";
import { requireSession } from "./session-cookies";
import { checkRateLimit } from "./rate-limit";
import * as Stream from "./cloudflare-stream";

// ─────────────────────────────────────────────────────────────────────
// Practitioner — create / update / archive
// ─────────────────────────────────────────────────────────────────────

export async function createProduct(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return;
  const description =
    String(formData.get("description") ?? "").trim().slice(0, 4000) || null;
  const priceDollars = parseFloat(
    String(formData.get("price") ?? "0")
  );
  const priceCents = Number.isFinite(priceDollars)
    ? Math.max(0, Math.round(priceDollars * 100))
    : 0;
  const paymentInstructions =
    String(formData.get("paymentInstructions") ?? "").trim().slice(0, 1000) ||
    null;
  const published = formData.get("published") === "true";

  const inserted = await db
    .insert(products)
    .values({
      accountId,
      name,
      description,
      priceCents,
      paymentInstructions,
      published,
    })
    .returning({ id: products.id });

  revalidatePath("/library");
  revalidatePath("/");
  redirect(`/library/${inserted[0].id}`);
}

export async function updateProduct(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return;
  const description =
    String(formData.get("description") ?? "").trim().slice(0, 4000) || null;
  const priceDollars = parseFloat(
    String(formData.get("price") ?? "0")
  );
  const priceCents = Number.isFinite(priceDollars)
    ? Math.max(0, Math.round(priceDollars * 100))
    : 0;
  const paymentInstructions =
    String(formData.get("paymentInstructions") ?? "").trim().slice(0, 1000) ||
    null;
  const published = formData.get("published") === "true";

  await db
    .update(products)
    .set({
      name,
      description,
      priceCents,
      paymentInstructions,
      published,
      updatedAt: new Date(),
    })
    .where(and(eq(products.accountId, accountId), eq(products.id, id)));

  revalidatePath("/library");
  revalidatePath(`/library/${id}`);
  revalidatePath("/");
  revalidatePath(`/offerings/${id}`);
}

export async function archiveProduct(id: string): Promise<{ ok: true }> {
  const { accountId } = await requireSession();
  // Delete the video from Cloudflare too — no orphaned storage bills.
  const [row] = await db
    .select({ videoId: products.videoId })
    .from(products)
    .where(and(eq(products.accountId, accountId), eq(products.id, id)))
    .limit(1);
  if (row?.videoId) {
    try {
      await Stream.deleteVideo(row.videoId);
    } catch (err) {
      console.warn("[product] could not delete archived video", err);
    }
  }
  await db
    .update(products)
    .set({
      archivedAt: new Date(),
      published: false,
      videoId: null,
      videoUploadedAt: null,
      videoDurationSeconds: null,
    })
    .where(and(eq(products.accountId, accountId), eq(products.id, id)));
  revalidatePath("/library");
  revalidatePath("/");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Practitioner — upload the product video to Cloudflare
// ─────────────────────────────────────────────────────────────────────

export type CreateProductUploadResult =
  | { ok: true; uploadURL: string; uid: string }
  | { ok: false; error: string };

export async function createProductUpload(
  productId: string
): Promise<CreateProductUploadResult> {
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
      .select({ id: products.id, existing: products.videoId })
      .from(products)
      .where(and(eq(products.accountId, accountId), eq(products.id, productId)))
      .limit(1);
    if (!row) return { ok: false, error: "Product not found." };

    if (row.existing) {
      try {
        await Stream.deleteVideo(row.existing);
      } catch (err) {
        console.warn("[product] could not delete prior video", err);
      }
    }
    const { uploadURL, uid } = await Stream.createDirectUpload({
      meta: { productId, kind: "product" },
      requireSignedURLs: true,
    });
    await db
      .update(products)
      .set({
        videoId: uid,
        videoUploadedAt: null,
        videoDurationSeconds: null,
        updatedAt: new Date(),
      })
      .where(and(eq(products.accountId, accountId), eq(products.id, productId)));
    return { ok: true, uploadURL, uid };
  } catch (err) {
    console.error("[product] createProductUpload failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start upload.",
    };
  }
}

export async function confirmProductUpload(
  productId: string
): Promise<{ ok: true; readyToStream: boolean } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const [row] = await db
      .select({ uid: products.videoId })
      .from(products)
      .where(and(eq(products.accountId, accountId), eq(products.id, productId)))
      .limit(1);
    if (!row?.uid) {
      return { ok: false, error: "No upload in progress." };
    }
    const details = await Stream.getVideoDetails(row.uid);
    if (!details) {
      await db
        .update(products)
        .set({
          videoId: null,
          videoUploadedAt: null,
          videoDurationSeconds: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(products.accountId, accountId), eq(products.id, productId))
        );
      return { ok: false, error: "Upload didn't complete." };
    }
    await db
      .update(products)
      .set({
        videoUploadedAt: new Date(),
        videoDurationSeconds: details.durationSeconds,
        updatedAt: new Date(),
      })
      .where(and(eq(products.accountId, accountId), eq(products.id, productId)));
    revalidatePath(`/library/${productId}`);
    revalidatePath(`/offerings/${productId}`);
    return { ok: true, readyToStream: details.readyToStream };
  } catch (err) {
    console.error("[product] confirmProductUpload failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not confirm upload.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public — buyer submits a purchase request (no auth)
// ─────────────────────────────────────────────────────────────────────

export type PurchaseRequestResult =
  | { ok: true; purchaseId: string }
  | { ok: false; error: string };

export async function requestProductPurchase(
  _prev: PurchaseRequestResult | undefined,
  formData: FormData
): Promise<PurchaseRequestResult> {
  const hp = String(formData.get("_hp") ?? "").trim();
  if (hp.length > 0) {
    return { ok: true, purchaseId: "honeypot-trapped" };
  }

  const productId = String(formData.get("productId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const emailRaw = String(formData.get("email") ?? "").trim().slice(0, 200);
  const phone =
    String(formData.get("phone") ?? "").trim().slice(0, 50) || null;

  if (!productId) return { ok: false, error: "Missing offering." };
  if (!name) return { ok: false, error: "Please share your name." };
  if (!emailRaw || !emailRaw.includes("@")) {
    return { ok: false, error: "Please share a valid email." };
  }
  const email = emailRaw.toLowerCase();

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit("product-purchase", ip, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return {
      ok: false,
      error: `Slow down a moment. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  // Verify product exists + is published + not archived
  const [product] = await db
    .select({
      id: products.id,
      accountId: products.accountId,
      published: products.published,
      archivedAt: products.archivedAt,
      videoUploadedAt: products.videoUploadedAt,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product || !product.published || product.archivedAt) {
    return { ok: false, error: "That offering isn't available." };
  }
  if (!product.videoUploadedAt) {
    return {
      ok: false,
      error: "That offering isn't ready yet. Try again soon.",
    };
  }

  // Per-product email dedup — if she submits twice, treat the second as
  // success silently (no leak of "you already bought").
  const [existing] = await db
    .select({ id: productPurchases.id })
    .from(productPurchases)
    .where(
      and(
        eq(productPurchases.productId, productId),
        sql`LOWER(${productPurchases.purchaserEmail}) = ${email}`
      )
    )
    .orderBy(desc(productPurchases.createdAt))
    .limit(1);
  if (existing) {
    return { ok: true, purchaseId: existing.id };
  }

  const accessToken = randomBytes(32).toString("base64url");

  const [inserted] = await db
    .insert(productPurchases)
    .values({
      accountId: product.accountId,
      productId,
      purchaserName: name,
      purchaserEmail: email,
      purchaserPhone: phone,
      status: "pending",
      paid: false,
      accessToken,
      sourceIp: ip === "unknown" ? null : ip,
      userAgent: h.get("user-agent") ?? null,
    })
    .returning({ id: productPurchases.id });

  revalidatePath("/loose-ends");
  revalidatePath(`/library/${productId}`);

  return { ok: true, purchaseId: inserted.id };
}

// ─────────────────────────────────────────────────────────────────────
// Practitioner — purchase triage
// ─────────────────────────────────────────────────────────────────────

export async function confirmPurchase(
  purchaseId: string,
  markPaid: boolean
): Promise<{ ok: true; watchUrl: string } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    const update: Record<string, unknown> = {
      status: "confirmed",
      confirmedAt: new Date(),
      updatedAt: new Date(),
    };
    if (markPaid) {
      update.paid = true;
      update.paidAt = new Date();
    }
    const [row] = await db
      .update(productPurchases)
      .set(update)
      .where(
        and(
          eq(productPurchases.accountId, accountId),
          eq(productPurchases.id, purchaseId)
        )
      )
      .returning({
        id: productPurchases.id,
        productId: productPurchases.productId,
        accessToken: productPurchases.accessToken,
      });
    if (!row) return { ok: false, error: "Purchase not found." };
    revalidatePath("/loose-ends");
    revalidatePath(`/library/${row.productId}`);
    return {
      ok: true,
      watchUrl: `/watch/${row.id}?token=${row.accessToken}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't confirm",
    };
  }
}

export async function refundPurchase(
  purchaseId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    await db
      .update(productPurchases)
      .set({
        status: "refunded",
        // Rotate the access token so the watch link dies even if it leaked.
        accessToken: randomBytes(32).toString("base64url"),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productPurchases.accountId, accountId),
          eq(productPurchases.id, purchaseId)
        )
      );
    revalidatePath("/loose-ends");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't refund",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Storefront listing — published products with uploaded video
// ─────────────────────────────────────────────────────────────────────

export async function listPublishedProducts(limit: number = 6) {
  return db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      priceCents: products.priceCents,
      currency: products.currency,
      videoDurationSeconds: products.videoDurationSeconds,
    })
    .from(products)
    .where(
      and(
        eq(products.published, true),
        isNull(products.archivedAt),
        // Only products with a finished upload — don't show "coming soon"
        sql`${products.videoUploadedAt} IS NOT NULL`
      )
    )
    .orderBy(desc(products.createdAt))
    .limit(limit);
}

// ─────────────────────────────────────────────────────────────────────
// Watch-page helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Validates a /watch/[purchaseId]?token=… combination and returns the
 * info the page needs. Returns null on any mismatch (don't leak why).
 */
export async function getWatchAccess(
  purchaseId: string,
  token: string
): Promise<{
  productName: string;
  productDescription: string | null;
  videoId: string | null;
  videoUploadedAt: Date | null;
} | null> {
  if (!purchaseId || !token) return null;
  const [row] = await db
    .select({
      status: productPurchases.status,
      accessToken: productPurchases.accessToken,
      productName: products.name,
      productDescription: products.description,
      videoId: products.videoId,
      videoUploadedAt: products.videoUploadedAt,
    })
    .from(productPurchases)
    .innerJoin(products, eq(products.id, productPurchases.productId))
    .where(eq(productPurchases.id, purchaseId))
    .limit(1);
  if (!row) return null;
  if (row.status !== "confirmed") return null;
  // Constant-time compare to avoid leaking token-prefix timing.
  if (!safeEqual(row.accessToken, token)) return null;
  return {
    productName: row.productName,
    productDescription: row.productDescription,
    videoId: row.videoId,
    videoUploadedAt: row.videoUploadedAt
      ? new Date(row.videoUploadedAt)
      : null,
  };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
