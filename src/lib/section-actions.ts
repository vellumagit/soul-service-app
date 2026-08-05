"use server";

// The storefront's sections — reorder, hide, and edit their words.
//
// Two different stores behind one UI:
//   • order + visibility → landing_sections rows (one per section per account)
//   • the words          → practitioner_settings.landingCopyOverrides (JSON,
//                          keyed by language then field)
//
// The copy save MERGES. Each section is now edited in its own dialog, so a
// submit carrying only the hero's three boxes must leave every other section's
// wording untouched — see mergeSectionOverrides.
//
// NOTE: every export here is a public POST endpoint. All of them start with
// requireSession() and scope writes by accountId.

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { landingSections, practitionerSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession } from "./session-cookies";
import {
  LANDING_SECTIONS,
  findLandingSection,
  resolveSections,
  type LandingSectionSlug,
} from "./landing-sections";
import {
  mergeSectionOverrides,
  type LandingCopyOverrides,
} from "./landing-overrides";

function revalidateStorefront() {
  revalidatePath("/");
  revalidatePath("/settings");
}

/** Current arrangement for this account, catalogue defaults filled in. */
async function currentArrangement(accountId: string) {
  const rows = await db
    .select({
      slug: landingSections.slug,
      sortOrder: landingSections.sortOrder,
      visible: landingSections.visible,
    })
    .from(landingSections)
    .where(eq(landingSections.accountId, accountId));
  return resolveSections(rows);
}

/**
 * Write the whole arrangement back.
 *
 * Upserting every section (not just the two that moved) is what makes the
 * first reorder work: an account with no rows yet has nothing to swap, so the
 * catalogue order has to be materialised in one go. `onConflictDoUpdate`
 * against the (account_id, slug) unique index makes it idempotent.
 */
async function persistArrangement(
  accountId: string,
  ordered: { slug: string; visible: boolean }[]
) {
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    await db
      .insert(landingSections)
      .values({
        accountId,
        slug: s.slug,
        sortOrder: i,
        visible: s.visible,
      })
      .onConflictDoUpdate({
        target: [landingSections.accountId, landingSections.slug],
        set: { sortOrder: i, visible: s.visible, updatedAt: new Date() },
      });
  }
}

/** Move a section one place up or down the page. */
export async function moveLandingSection(
  slug: string,
  direction: "up" | "down"
): Promise<void> {
  const { accountId } = await requireSession();
  const meta = findLandingSection(slug);
  if (!meta || !meta.canMove) return;

  const list = await currentArrangement(accountId);
  const i = list.findIndex((s) => s.slug === slug);
  if (i === -1) return;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  // Never let anything swap past a pinned section (the hero).
  if (!list[j].canMove) return;

  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  await persistArrangement(
    accountId,
    next.map((s) => ({ slug: s.slug, visible: s.visible }))
  );
  revalidateStorefront();
}

/** Show or hide a section on the public page. */
export async function toggleLandingSection(slug: string): Promise<void> {
  const { accountId } = await requireSession();
  const meta = findLandingSection(slug);
  if (!meta || !meta.canHide) return;

  const list = await currentArrangement(accountId);
  await persistArrangement(
    accountId,
    list.map((s) => ({
      slug: s.slug,
      visible: s.slug === slug ? !s.visible : s.visible,
    }))
  );
  revalidateStorefront();
}

/**
 * Save one section's words, in both languages.
 *
 * Reads her existing overrides and merges this section's keys over them. A
 * blank box deletes its key, which restores the built-in wording — that's how
 * "clear it to undo" keeps working now the fields are split across dialogs.
 */
export async function saveSectionCopy(formData: FormData): Promise<void> {
  const { accountId } = await requireSession();
  const slug = String(formData.get("section") ?? "");
  const meta = findLandingSection(slug);
  if (!meta) throw new Error("That section doesn't exist.");

  const [row] = await db
    .select({ overrides: practitionerSettings.landingCopyOverrides })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, accountId))
    .limit(1);

  const merged = mergeSectionOverrides(
    (row?.overrides ?? null) as LandingCopyOverrides | null,
    meta.slug as LandingSectionSlug,
    formData
  );

  await db
    .update(practitionerSettings)
    .set({ landingCopyOverrides: merged, updatedAt: new Date() })
    .where(eq(practitionerSettings.accountId, accountId));

  revalidateStorefront();
}

/**
 * Put every section back to its built-in order, all visible.
 *
 * Her words are untouched — this is an arrangement reset, not a copy reset.
 */
export async function resetLandingSections(): Promise<void> {
  const { accountId } = await requireSession();
  await db
    .delete(landingSections)
    .where(and(eq(landingSections.accountId, accountId)));
  // Nothing to re-insert: an account with no rows resolves to the catalogue
  // order with everything visible, which is exactly the reset state.
  void LANDING_SECTIONS;
  revalidateStorefront();
}
