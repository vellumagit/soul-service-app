"use server";

// Lead magnets — free, email-gated resources (a PDF, an image, or a pasted
// video link). Admin actions (create / edit / publish / delete) are gated by
// requireSession; submitLeadMagnetOptin is PUBLIC (called from /free/<slug>)
// and mirrors submitQuizLead: it writes the opt-in to lead_submissions so it
// lands in /network/inbox, then delivers the asset by email instantly.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  leadForms,
  leadMagnets,
  leadSubmissions,
  practitionerSettings,
  type LeadMagnetFollowup,
} from "@/db/schema";
import { requireSession } from "./session-cookies";
import { resolveStorefrontAccountId } from "./storefront-account";
import { checkRateLimit } from "./rate-limit";
import {
  slugifyFormName,
  generateLeadFormToken,
  hashLeadFormToken,
  leadFormTokenPrefix,
} from "./lead-tokens";
import {
  isResendConfigured,
  sendLeadMagnetDeliveryEmail,
  sendLandingInquiryNotifyEmail,
} from "./resend";

const LEAD_MAGNET_FORM_SLUG = "lead-magnets";
const ASSET_KINDS = ["pdf", "image", "video_link"] as const;
type AssetKind = (typeof ASSET_KINDS)[number];

/** Bilingual fallback: the asked-for language, else the other, else "". */
function pickLang(en: string, uk: string, lang: "en" | "uk"): string {
  const primary = (lang === "uk" ? uk : en) ?? "";
  const fallback = (lang === "uk" ? en : uk) ?? "";
  return primary.trim() || fallback.trim() || "";
}

/** Default delivery-button label by asset kind, when she leaves it blank. */
function defaultAssetLabel(kind: AssetKind, lang: "en" | "uk"): string {
  if (kind === "video_link") return lang === "uk" ? "Дивитися відео" : "Watch the video";
  if (kind === "image") return lang === "uk" ? "Відкрити зображення" : "Open the image";
  return lang === "uk" ? "Завантажити" : "Download";
}

function str(v: FormDataEntryValue | null, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function ensureUniqueSlug(
  accountId: string,
  base: string,
  excludeId: string | null
): Promise<string> {
  const clean = slugifyFormName(base) || "resource";
  const rows = await db
    .select({ id: leadMagnets.id, slug: leadMagnets.slug })
    .from(leadMagnets)
    .where(eq(leadMagnets.accountId, accountId));
  const taken = new Set(
    rows.filter((r) => r.id !== excludeId).map((r) => r.slug)
  );
  if (!taken.has(clean)) return clean;
  for (let i = 2; i < 500; i++) {
    const candidate = `${clean}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${clean}-${Date.now()}`;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type SaveLeadMagnetResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// Admin: create or update a lead magnet (upsert keyed on the hidden `id`).
// Handles the asset inline — uploads a chosen PDF/image to Blob, or stores a
// pasted video URL. On edit with no new file, the existing asset is kept.
// ─────────────────────────────────────────────────────────────────────────────
export async function saveLeadMagnet(
  formData: FormData
): Promise<SaveLeadMagnetResult> {
  const { accountId } = await requireSession();

  const id = str(formData.get("id")) || null;
  const kindRaw = str(formData.get("assetKind")) as AssetKind;
  const assetKind: AssetKind = ASSET_KINDS.includes(kindRaw) ? kindRaw : "pdf";

  const titleEn = str(formData.get("titleEn"), 300);
  const titleUk = str(formData.get("titleUk"), 300);
  if (!titleEn && !titleUk) {
    return { ok: false, error: "Give it a title (English or Ukrainian)." };
  }

  // Publishing now (checkbox on) vs saving a draft. A draft can be saved with
  // whatever's filled in so far — only publishing requires the full set (a
  // resource + valid links), because that's when the /free page goes live.
  const willPublish = str(formData.get("published")) === "on";

  // Load the existing row (edit) so we can keep the asset if none is re-uploaded.
  let existing: typeof leadMagnets.$inferSelect | null = null;
  if (id) {
    const rows = await db
      .select()
      .from(leadMagnets)
      .where(and(eq(leadMagnets.id, id), eq(leadMagnets.accountId, accountId)))
      .limit(1);
    existing = rows[0] ?? null;
    if (!existing) return { ok: false, error: "That resource no longer exists." };
  }

  const slugInput = str(formData.get("slug"), 120) || titleEn || titleUk;
  const slug = await ensureUniqueSlug(accountId, slugInput, id);

  // Resolve the asset. PDFs/images are uploaded to Blob directly from the
  // browser (bypassing the 4 MB server-action limit), so the form carries the
  // resulting URL, not the bytes. A video is just the pasted link. Only keep the
  // existing asset when the KIND is unchanged — a video→pdf or pdf→image switch
  // must bring its own asset, or we'd serve the old file under the wrong type.
  const kindUnchanged = existing ? existing.assetKind === assetKind : false;
  let assetUrl: string | null = kindUnchanged ? existing?.assetUrl ?? null : null;
  let assetName: string | null = kindUnchanged
    ? existing?.assetName ?? null
    : null;

  if (assetKind === "video_link") {
    const url = str(formData.get("assetVideoUrl"), 1000);
    if (url) {
      if (!isHttpUrl(url)) {
        return { ok: false, error: "That video link doesn't look like a URL." };
      }
      assetUrl = url;
      assetName = null;
    } else if (!kindUnchanged) {
      // Switched to a video and none pasted yet — clear any inherited asset.
      assetUrl = null;
      assetName = null;
    }
  } else {
    const url = str(formData.get("assetUrl"), 1000);
    if (url) {
      if (!isHttpUrl(url)) {
        return { ok: false, error: "That file didn't upload cleanly — try again." };
      }
      assetUrl = url;
      assetName = str(formData.get("assetName"), 300) || null;
    }
  }

  // The resource is only REQUIRED to publish — a draft can be saved without one
  // and finished later. (The /free page needs something to hand over, so we
  // can't publish an empty one.)
  if (willPublish && !assetUrl) {
    return {
      ok: false,
      error:
        assetKind === "video_link"
          ? "Paste the video link before publishing — you can save it as a draft for now."
          : assetKind === "pdf"
            ? "Attach a PDF before publishing — you can save it as a draft for now."
            : "Attach an image before publishing — you can save it as a draft for now.",
    };
  }

  // Follow-up "flow": up to 2 nurture emails. A slot with no subject/body in
  // either language is treated as empty and dropped. Delay is entered in days.
  const followups: LeadMagnetFollowup[] = [];
  for (const i of [1, 2]) {
    const subjectEn = str(formData.get(`fuSubjectEn${i}`), 300);
    const subjectUk = str(formData.get(`fuSubjectUk${i}`), 300);
    const bodyEn = str(formData.get(`fuBodyEn${i}`), 6000);
    const bodyUk = str(formData.get(`fuBodyUk${i}`), 6000);
    if (!subjectEn && !subjectUk && !bodyEn && !bodyUk) continue;
    const daysRaw = Number.parseInt(str(formData.get(`fuDelayDays${i}`)), 10);
    const days = Number.isFinite(daysRaw)
      ? Math.min(365, Math.max(0, daysRaw))
      : 2;
    // Optional CTA button: bilingual label + one link. Kept when there's both a
    // label (either language) and a non-empty link. The link may be absolute
    // (https://…) or site-relative (/#contact, /circles/x) — the email renderer
    // resolves relative links against the storefront origin, so we don't reject
    // them here (rejecting silently dropped the button the UI invited).
    const ctaLabelEn = str(formData.get(`fuCtaLabelEn${i}`), 80);
    const ctaLabelUk = str(formData.get(`fuCtaLabelUk${i}`), 80);
    const ctaHrefRaw = str(formData.get(`fuCtaHref${i}`), 1000);
    const hasCta = Boolean((ctaLabelEn || ctaLabelUk) && ctaHrefRaw.length > 0);
    followups.push({
      delayHours: days * 24,
      subjectEn,
      subjectUk,
      bodyEn,
      bodyUk,
      ...(hasCta
        ? { ctaLabelEn, ctaLabelUk, ctaHref: ctaHrefRaw }
        : {}),
    });
  }

  // Anchor the flow the first time it becomes non-empty. The nurture cron only
  // emails opt-ins captured at/after this, so adding a flow never retroactively
  // blasts everyone who signed up before it existed. Preserved once set.
  const followupsSetAt =
    followups.length > 0
      ? existing?.followupsSetAt ?? new Date()
      : existing?.followupsSetAt ?? null;

  const values = {
    accountId,
    slug,
    titleEn,
    titleUk,
    subtitleEn: str(formData.get("subtitleEn"), 400),
    subtitleUk: str(formData.get("subtitleUk"), 400),
    descriptionEn: str(formData.get("descriptionEn"), 4000),
    descriptionUk: str(formData.get("descriptionUk"), 4000),
    buttonEn: str(formData.get("buttonEn"), 120),
    buttonUk: str(formData.get("buttonUk"), 120),
    assetKind,
    assetUrl,
    assetName,
    assetLabelEn: str(formData.get("assetLabelEn"), 120),
    assetLabelUk: str(formData.get("assetLabelUk"), 120),
    ctaLabelEn: str(formData.get("ctaLabelEn"), 120),
    ctaLabelUk: str(formData.get("ctaLabelUk"), 120),
    ctaHref: str(formData.get("ctaHref"), 1000) || null,
    followups,
    followupsSetAt,
    published: willPublish,
    updatedAt: new Date(),
  };

  let savedId: string;
  if (existing) {
    await db
      .update(leadMagnets)
      .set(values)
      .where(
        and(eq(leadMagnets.id, existing.id), eq(leadMagnets.accountId, accountId))
      );
    savedId = existing.id;
  } else {
    const inserted = await db
      .insert(leadMagnets)
      .values(values)
      .returning({ id: leadMagnets.id });
    savedId = inserted[0].id;
  }

  revalidatePath("/lead-magnets");
  revalidatePath(`/free/${slug}`);
  return { ok: true, id: savedId, slug };
}

export async function setLeadMagnetPublished(
  id: string,
  published: boolean
): Promise<void> {
  const { accountId } = await requireSession();
  const rows = await db
    .update(leadMagnets)
    .set({ published, updatedAt: new Date() })
    .where(and(eq(leadMagnets.id, id), eq(leadMagnets.accountId, accountId)))
    .returning({ slug: leadMagnets.slug });
  revalidatePath("/lead-magnets");
  if (rows[0]) revalidatePath(`/free/${rows[0].slug}`);
}

export async function deleteLeadMagnet(id: string): Promise<void> {
  const { accountId } = await requireSession();
  const rows = await db
    .delete(leadMagnets)
    .where(and(eq(leadMagnets.id, id), eq(leadMagnets.accountId, accountId)))
    .returning({ slug: leadMagnets.slug, assetUrl: leadMagnets.assetUrl });
  const gone = rows[0];
  // Best-effort: clean the Blob asset (only ones we uploaded).
  if (gone?.assetUrl?.includes(".public.blob.vercel-storage.com")) {
    try {
      const { del } = await import("@vercel/blob");
      await del(gone.assetUrl);
    } catch (e) {
      console.warn("[deleteLeadMagnet] couldn't delete asset:", e);
    }
  }
  revalidatePath("/lead-magnets");
  if (gone) revalidatePath(`/free/${gone.slug}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature a lead magnet on the landing page (the "Free resource" / freebie
// section). One at a time: this is a single pointer on settings, so featuring
// another simply replaces it. Pass null to un-feature. The section still only
// renders when the pointed-at magnet is published + not archived.
// ─────────────────────────────────────────────────────────────────────────────
export async function setFeaturedLeadMagnet(
  id: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { accountId } = await requireSession();
    if (id) {
      const [m] = await db
        .select({ id: leadMagnets.id })
        .from(leadMagnets)
        .where(and(eq(leadMagnets.id, id), eq(leadMagnets.accountId, accountId)))
        .limit(1);
      if (!m) return { ok: false, error: "That lead magnet no longer exists." };
    }
    // accountId is unique on practitioner_settings, so upsert on it.
    await db
      .insert(practitionerSettings)
      .values({ accountId, featuredLeadMagnetId: id })
      .onConflictDoUpdate({
        target: practitionerSettings.accountId,
        set: { featuredLeadMagnetId: id },
      });
    revalidatePath("/lead-magnets");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't update that.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: someone opted in on /free/<slug>. Capture the lead + deliver the
// asset by email. No auth. Anti-abuse mirrors submitQuizLead.
// ─────────────────────────────────────────────────────────────────────────────
export type LeadMagnetOptinResult =
  | { ok: true; assetUrl: string; assetLabel: string }
  | { ok: false; error: string };

export async function submitLeadMagnetOptin(input: {
  slug: string;
  name: string;
  email: string;
  lang?: "en" | "uk";
  _hp?: string;
}): Promise<LeadMagnetOptinResult> {
  if ((input._hp ?? "").trim().length > 0) {
    // Bot — pretend success, do nothing.
    return { ok: true, assetUrl: "#", assetLabel: "" };
  }

  const lang: "en" | "uk" = input.lang === "uk" ? "uk" : "en";
  const name = String(input.name ?? "").trim().slice(0, 200);
  const emailRaw = String(input.email ?? "").trim();
  if (!name) {
    return { ok: false, error: lang === "uk" ? "Вкажіть ваше ім'я." : "Please share your name." };
  }
  if (!emailRaw || !emailRaw.includes("@")) {
    return {
      ok: false,
      error: lang === "uk" ? "Вкажіть дійсну електронну пошту." : "Please share a valid email.",
    };
  }
  const email = emailRaw.toLowerCase().slice(0, 200);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit("lead-magnet-optin", ip, {
    limit: 8,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return {
      ok: false,
      error:
        lang === "uk"
          ? `Трохи зачекайте — спробуйте за ${limit.retryAfterSeconds}с.`
          : `Slow down a moment — try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  const accountId = await resolveStorefrontAccountId();
  if (!accountId) {
    return {
      ok: false,
      error:
        lang === "uk"
          ? "Практику ще не налаштовано. Спробуйте трохи згодом."
          : "The practice isn't set up yet. Try again shortly.",
    };
  }

  const magnetRows = await db
    .select()
    .from(leadMagnets)
    .where(
      and(
        eq(leadMagnets.accountId, accountId),
        eq(leadMagnets.slug, input.slug),
        eq(leadMagnets.published, true)
      )
    )
    .limit(1);
  const magnet = magnetRows[0];
  if (!magnet || magnet.archivedAt || !magnet.assetUrl) {
    return {
      ok: false,
      error:
        lang === "uk"
          ? "Цей матеріал наразі недоступний."
          : "That resource isn't available right now.",
    };
  }

  const title = pickLang(magnet.titleEn, magnet.titleUk, lang);
  const assetLabel =
    pickLang(magnet.assetLabelEn, magnet.assetLabelUk, lang) ||
    defaultAssetLabel(magnet.assetKind as AssetKind, lang);
  const ctaLabel = pickLang(magnet.ctaLabelEn, magnet.ctaLabelUk, lang);

  // Find or create the shared "Lead magnets" lead form (idempotent).
  const existingForm = await db
    .select({ id: leadForms.id })
    .from(leadForms)
    .where(
      and(
        eq(leadForms.accountId, accountId),
        eq(leadForms.slug, LEAD_MAGNET_FORM_SLUG)
      )
    )
    .limit(1);
  let formId: string;
  if (existingForm[0]) {
    formId = existingForm[0].id;
  } else {
    const cleartext = generateLeadFormToken();
    const inserted = await db
      .insert(leadForms)
      .values({
        accountId,
        name: "Lead magnets",
        slug: LEAD_MAGNET_FORM_SLUG,
        tokenHash: hashLeadFormToken(cleartext),
        tokenPrefix: leadFormTokenPrefix(cleartext),
        autoAccept: false,
        defaultIntent: "Downloaded a free resource",
      })
      .returning({ id: leadForms.id });
    formId = inserted[0].id;
  }

  // Dedup: a refresh or double-submit shouldn't create a second lead, inflate
  // the count, or (worst of all) start a second follow-up sequence. If this
  // email already opted in to THIS magnet, skip the write — we still re-deliver
  // the asset below, since they may just be after another copy.
  const priorOptin = await db
    .select({ id: leadSubmissions.id })
    .from(leadSubmissions)
    .where(
      and(
        eq(leadSubmissions.accountId, accountId),
        eq(leadSubmissions.formId, formId),
        eq(leadSubmissions.email, email),
        sql`${leadSubmissions.fields}->>'magnetId' = ${magnet.id}`
      )
    )
    .limit(1);
  const isRepeat = priorOptin.length > 0;

  if (!isRepeat) {
    await db.insert(leadSubmissions).values({
      accountId,
      formId,
      name,
      email,
      fields: {
        kind: "lead-magnet",
        magnetId: magnet.id,
        magnetSlug: magnet.slug,
        magnetTitle: title,
        lang,
        // Nurture bookkeeping: which follow-ups (by delayHours) have sent.
        followupsSent: [] as number[],
        source: "lead-magnet",
      },
      sourceIp: ip === "unknown" ? null : ip,
      userAgent: h.get("user-agent") ?? null,
      referer: h.get("referer") ?? null,
      status: "pending",
    });

    await db
      .update(leadMagnets)
      .set({ optinCount: sql`${leadMagnets.optinCount} + 1` })
      .where(eq(leadMagnets.id, magnet.id));
  }

  // Deliver the asset + notify her. Best-effort — the lead is already saved,
  // so a mail hiccup must never fail the opt-in or hide it from her inbox.
  try {
    if (isResendConfigured()) {
      const [acct] = await db
        .select({ email: accounts.email })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);
      const [pset] = await db
        .select({
          practitionerName: practitionerSettings.practitionerName,
          businessEmail: practitionerSettings.businessEmail,
        })
        .from(practitionerSettings)
        .where(eq(practitionerSettings.accountId, accountId))
        .limit(1);

      const practitionerName = pset?.practitionerName ?? null;
      const replyTo = pset?.businessEmail || acct?.email || undefined;
      const notifyTo = acct?.email || pset?.businessEmail || null;

      try {
        await sendLeadMagnetDeliveryEmail({
          to: email,
          name,
          lang,
          title,
          assetUrl: magnet.assetUrl,
          assetLabel,
          practitionerName,
          ctaLabel: ctaLabel || null,
          ctaHref: magnet.ctaHref,
          replyTo,
        });
      } catch (err) {
        console.error("[lead-magnet] delivery email failed:", err);
      }

      if (notifyTo && !isRepeat) {
        try {
          await sendLandingInquiryNotifyEmail({
            to: notifyTo,
            practitionerName,
            fromName: name,
            fromEmail: email,
            message: `Grabbed "${title}" (free resource).`,
            preferredWhenLabel: null,
          });
        } catch (err) {
          console.error("[lead-magnet] notify email failed:", err);
        }
      }
    }
  } catch (err) {
    console.error("[lead-magnet] notification block failed:", err);
  }

  return { ok: true, assetUrl: magnet.assetUrl, assetLabel };
}
