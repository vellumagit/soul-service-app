"use server";

// Offers on the storefront ladder — add, edit, reorder, remove.
//
// Mirrors review-actions.ts deliberately: same shape, same guarantees, so
// there's one pattern to learn for "a list she manages that renders publicly".
//
// NOTE: every export in a "use server" file is a public POST endpoint. Each one
// below starts with requireSession() and scopes its writes by accountId.
// Helpers that must NOT be callable from the browser stay module-local.

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { landingOffers, landingOfferRows } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireSession } from "./session-cookies";
import { OFFER_LINK_KINDS, OFFER_VARIANTS } from "./landing-offers";

const MAX_SHORT = 160;
const MAX_LONG = 1200;

function str(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
}

/** Whitelist on write — an unknown value here would render a broken card. */
function oneOf(value: string, allowed: string[], fallback: string): string {
  return allowed.includes(value) ? value : fallback;
}

/**
 * A custom link must be a relative path or an http(s) URL.
 *
 * Without this a pasted `javascript:` URL would become a live anchor on the
 * public storefront — the classic stored-XSS-via-href. Anything unparseable
 * degrades to the contact anchor rather than being rendered as typed.
 */
function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("/") || v.startsWith("#")) return v;
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {
    /* fall through */
  }
  return null;
}

function revalidateStorefront() {
  revalidatePath("/");
  revalidatePath("/settings");
}

/**
 * Which row an offer belongs to.
 *
 * Validates the id belongs to THIS account — a submitted row id is user input,
 * and an unchecked one would let an offer be parked in another practitioner's
 * row. Anything unusable falls back to her first row (created on demand),
 * because an offer with no row can't render.
 */
async function resolveRowId(
  accountId: string,
  submitted: string
): Promise<string> {
  if (submitted) {
    const [own] = await db
      .select({ id: landingOfferRows.id })
      .from(landingOfferRows)
      .where(
        and(
          eq(landingOfferRows.id, submitted),
          eq(landingOfferRows.accountId, accountId)
        )
      )
      .limit(1);
    if (own) return own.id;
  }
  return ensureFirstRow(accountId);
}

/** Her first row, created on demand. */
async function ensureFirstRow(accountId: string): Promise<string> {
  const [first] = await db
    .select({ id: landingOfferRows.id })
    .from(landingOfferRows)
    .where(eq(landingOfferRows.accountId, accountId))
    .orderBy(asc(landingOfferRows.sortOrder), asc(landingOfferRows.createdAt))
    .limit(1);
  if (first) return first.id;
  const [created] = await db
    .insert(landingOfferRows)
    .values({ accountId, sortOrder: 0 })
    .returning({ id: landingOfferRows.id });
  return created.id;
}

/**
 * Create or update an offer. `id` blank -> create.
 *
 * A title in at least one language is required: the ladder is a row of named
 * cards, and an untitled one is filtered out of the render anyway.
 */
export async function saveOffer(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();

  const id = str(formData, "id", 100);
  const titleEn = str(formData, "titleEn", MAX_SHORT);
  const titleUk = str(formData, "titleUk", MAX_SHORT);
  if (!titleEn && !titleUk)
    throw new Error("Give the offer a name in at least one language.");

  const linkKind = oneOf(
    str(formData, "linkKind", 40),
    OFFER_LINK_KINDS,
    "contact"
  );
  const customHref =
    linkKind === "custom" ? safeHref(str(formData, "customHref", 500)) : null;
  if (linkKind === "custom" && !customHref)
    throw new Error(
      "That link doesn't look right. Use a full web address (https://…) or a path on your own site (/quiz)."
    );

  const values = {
    stepEn: str(formData, "stepEn", MAX_SHORT),
    stepUk: str(formData, "stepUk", MAX_SHORT),
    titleEn,
    titleUk,
    priceEn: str(formData, "priceEn", MAX_SHORT),
    priceUk: str(formData, "priceUk", MAX_SHORT),
    priceSuffixEn: str(formData, "priceSuffixEn", MAX_SHORT),
    priceSuffixUk: str(formData, "priceSuffixUk", MAX_SHORT),
    descriptionEn: str(formData, "descriptionEn", MAX_LONG),
    descriptionUk: str(formData, "descriptionUk", MAX_LONG),
    ctaEn: str(formData, "ctaEn", MAX_SHORT),
    ctaUk: str(formData, "ctaUk", MAX_SHORT),
    linkKind,
    customHref,
    variant: oneOf(str(formData, "variant", 40), OFFER_VARIANTS, "plain"),
    rowId: await resolveRowId(accountId, str(formData, "rowId", 100)),
    published: formData.get("published") != null,
    updatedAt: new Date(),
  };

  if (id) {
    const [existing] = await db
      .select({ id: landingOffers.id })
      .from(landingOffers)
      .where(
        and(eq(landingOffers.id, id), eq(landingOffers.accountId, accountId))
      )
      .limit(1);
    if (!existing) throw new Error("That offer no longer exists.");

    await db
      .update(landingOffers)
      .set(values)
      .where(
        and(eq(landingOffers.id, id), eq(landingOffers.accountId, accountId))
      );
  } else {
    const [last] = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)::int` })
      .from(landingOffers)
      .where(eq(landingOffers.accountId, accountId));

    await db.insert(landingOffers).values({
      accountId,
      ...values,
      sortOrder: (last?.max ?? -1) + 1,
    });
  }

  revalidateStorefront();
}

/** Delete an offer. Untick "Show on my page" to park one instead. */
export async function deleteOffer(id: string): Promise<void> {
  const { accountId } = await requireSession();
  await db
    .delete(landingOffers)
    .where(
      and(eq(landingOffers.id, id), eq(landingOffers.accountId, accountId))
    );
  revalidateStorefront();
}

/**
 * Move an offer one place up or down WITHIN ITS LANE.
 *
 * Ordering across the whole list would let a card jump lanes invisibly — the
 * ladder renders two rows, so "up" has to mean "earlier in this row". Swaps
 * sort_order with the neighbour found by position, which also self-heals
 * duplicate or gapped values from earlier edits.
 */
export async function moveOffer(
  id: string,
  direction: "up" | "down"
): Promise<void> {
  const { accountId } = await requireSession();

  const rows = await db
    .select({
      id: landingOffers.id,
      rowId: landingOffers.rowId,
      sortOrder: landingOffers.sortOrder,
    })
    .from(landingOffers)
    .where(eq(landingOffers.accountId, accountId))
    .orderBy(asc(landingOffers.sortOrder), asc(landingOffers.createdAt));

  const self = rows.find((r) => r.id === id);
  if (!self) return;

  const lane = rows.filter((r) => r.rowId === self.rowId);
  const i = lane.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= lane.length) return; // already at the end of its row

  // Swap the two rows' stored sort_order values. Using the neighbour's actual
  // value (not an index) keeps the rest of the list undisturbed.
  const a = lane[i];
  const b = lane[j];
  await db
    .update(landingOffers)
    .set({ sortOrder: b.sortOrder, updatedAt: new Date() })
    .where(
      and(eq(landingOffers.id, a.id), eq(landingOffers.accountId, accountId))
    );
  await db
    .update(landingOffers)
    .set({ sortOrder: a.sortOrder, updatedAt: new Date() })
    .where(
      and(eq(landingOffers.id, b.id), eq(landingOffers.accountId, accountId))
    );

  revalidateStorefront();
}

/** Move an offer into another of her rows. */
export async function moveOfferToRow(
  id: string,
  rowId: string
): Promise<void> {
  const { accountId } = await requireSession();
  const target = await resolveRowId(accountId, rowId);
  await db
    .update(landingOffers)
    .set({ rowId: target, updatedAt: new Date() })
    .where(
      and(eq(landingOffers.id, id), eq(landingOffers.accountId, accountId))
    );
  revalidateStorefront();
}

// -- Rows --------------------------------------------------------------------

/** Add a row at the bottom of the ladder. Heading optional, both languages. */
export async function createOfferRow(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();
  const [last] = await db
    .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)::int` })
    .from(landingOfferRows)
    .where(eq(landingOfferRows.accountId, accountId));

  await db.insert(landingOfferRows).values({
    accountId,
    titleEn: str(formData, "titleEn", MAX_SHORT),
    titleUk: str(formData, "titleUk", MAX_SHORT),
    sortOrder: (last?.max ?? -1) + 1,
  });
  revalidateStorefront();
}

/** Rename a row, or clear both headings so it renders bare. */
export async function renameOfferRow(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();
  const id = str(formData, "id", 100);
  if (!id) return;
  await db
    .update(landingOfferRows)
    .set({
      titleEn: str(formData, "titleEn", MAX_SHORT),
      titleUk: str(formData, "titleUk", MAX_SHORT),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(landingOfferRows.id, id),
        eq(landingOfferRows.accountId, accountId)
      )
    );
  revalidateStorefront();
}

/** Move a whole row up or down the ladder. */
export async function moveOfferRow(
  id: string,
  direction: "up" | "down"
): Promise<void> {
  const { accountId } = await requireSession();
  const rows = await db
    .select({ id: landingOfferRows.id, sortOrder: landingOfferRows.sortOrder })
    .from(landingOfferRows)
    .where(eq(landingOfferRows.accountId, accountId))
    .orderBy(asc(landingOfferRows.sortOrder), asc(landingOfferRows.createdAt));

  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return;

  // Rewrite the whole order by index — self-heals duplicate sort_order values,
  // and it's a handful of rows, so the cost is nothing.
  const next = [...rows];
  const tmp = next[i];
  next[i] = next[j];
  next[j] = tmp;
  for (let k = 0; k < next.length; k++) {
    await db
      .update(landingOfferRows)
      .set({ sortOrder: k, updatedAt: new Date() })
      .where(
        and(
          eq(landingOfferRows.id, next[k].id),
          eq(landingOfferRows.accountId, accountId)
        )
      );
  }
  revalidateStorefront();
}

/**
 * Delete a row.
 *
 * Refuses while it still holds offers. The DB enforces this too (ON DELETE
 * RESTRICT), but checking here means she gets a sentence rather than a
 * constraint violation. Also refuses to remove the last row, since every offer
 * needs somewhere to live.
 */
export async function deleteOfferRow(id: string): Promise<void> {
  const { accountId } = await requireSession();

  const rows = await db
    .select({ id: landingOfferRows.id })
    .from(landingOfferRows)
    .where(eq(landingOfferRows.accountId, accountId));
  if (rows.length <= 1)
    throw new Error(
      "This is your only row — add another one before removing this."
    );

  const [held] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(landingOffers)
    .where(
      and(eq(landingOffers.accountId, accountId), eq(landingOffers.rowId, id))
    );
  const n = held?.n ?? 0;
  if (n > 0)
    throw new Error(
      "That row still has " +
        n +
        " offer" +
        (n === 1 ? "" : "s") +
        " in it. Move or delete them first."
    );

  await db
    .delete(landingOfferRows)
    .where(
      and(
        eq(landingOfferRows.id, id),
        eq(landingOfferRows.accountId, accountId)
      )
    );
  revalidateStorefront();
}
