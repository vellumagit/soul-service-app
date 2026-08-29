import "server-only";

// The lead-magnet follow-up "flow" — nurture emails she scheduled to go out
// some hours/days after someone downloaded a lead magnet. Driven by the same
// reminders cron (every ~10 min). Kept deliberately cheap: the very first query
// only returns magnets that actually HAVE a flow, so on the common tick where
// nobody has set one up we do a single tiny query and stop — no extra Neon wake
// cost beyond what the reminders pass already pays.
//
// Bookkeeping lives on each opt-in's lead_submissions.fields.followupsSent (an
// array of already-sent follow-up indexes), so we never double-send and need no
// extra table. We send at most ONE follow-up per person per tick, so a cron
// that was delayed can't dump several emails on someone at once.

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  leadMagnets,
  leadSubmissions,
  practitionerSettings,
  type LeadMagnetFollowup,
} from "@/db/schema";
import { isResendConfigured, sendLeadMagnetFollowupEmail } from "./resend";

export type NurtureStats = { candidates: number; sent: number };

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

function applyVars(s: string, name: string | null): string {
  return s
    .replace(/\{first\}/g, firstName(name))
    .replace(/\{name\}/g, (name ?? "").trim());
}

function pickLang(en: string, uk: string, lang: "en" | "uk"): string {
  const primary = (lang === "uk" ? uk : en) ?? "";
  const fallback = (lang === "uk" ? en : uk) ?? "";
  return primary.trim() || fallback.trim() || "";
}

export async function processLeadMagnetFollowups(): Promise<NurtureStats> {
  if (!isResendConfigured()) return { candidates: 0, sent: 0 };

  // 1. Only magnets that actually have a flow. If none, stop — quiet tick.
  const magnets = await db
    .select({
      id: leadMagnets.id,
      accountId: leadMagnets.accountId,
      followups: leadMagnets.followups,
      followupsSetAt: leadMagnets.followupsSetAt,
    })
    .from(leadMagnets)
    .where(
      and(
        sql`jsonb_array_length(${leadMagnets.followups}) > 0`,
        // Unpublished / archived magnets stop nurturing, matching delivery + the
        // public page — unpublishing is how she halts a flow.
        eq(leadMagnets.published, true),
        isNull(leadMagnets.archivedAt)
      )
    );
  if (magnets.length === 0) return { candidates: 0, sent: 0 };

  const byId = new Map(magnets.map((m) => [m.id, m]));

  // 2. Recent lead-magnet opt-ins. Bound the scan by the LONGEST configured
  //    delay (+ a week's margin) so it stays as small as possible while never
  //    aging out an opt-in that still has a follow-up due.
  const maxDelayHours = Math.max(
    0,
    ...magnets.flatMap((m) =>
      (m.followups as LeadMagnetFollowup[]).map((f) => f.delayHours ?? 0)
    )
  );
  const lookbackMs = maxDelayHours * 3_600_000 + 7 * 24 * 3_600_000;
  const since = new Date(Date.now() - lookbackMs);
  const subs = await db
    .select({
      id: leadSubmissions.id,
      accountId: leadSubmissions.accountId,
      name: leadSubmissions.name,
      email: leadSubmissions.email,
      fields: leadSubmissions.fields,
      createdAt: leadSubmissions.createdAt,
    })
    .from(leadSubmissions)
    .where(
      and(
        sql`${leadSubmissions.fields}->>'kind' = 'lead-magnet'`,
        gt(leadSubmissions.createdAt, since)
      )
    );
  if (subs.length === 0) return { candidates: 0, sent: 0 };

  // Cache practitioner name / reply-to per account (usually one account).
  const acctCache = new Map<
    string,
    { practitionerName: string | null; replyTo?: string }
  >();
  async function acctInfo(accountId: string) {
    const cached = acctCache.get(accountId);
    if (cached) return cached;
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
    const info = {
      practitionerName: pset?.practitionerName ?? null,
      replyTo: pset?.businessEmail || acct?.email || undefined,
    };
    acctCache.set(accountId, info);
    return info;
  }

  const now = Date.now();
  let sent = 0;

  for (const sub of subs) {
    const fields = (sub.fields ?? {}) as {
      magnetId?: string;
      lang?: "en" | "uk";
      followupsSent?: number[];
    };
    const magnet = fields.magnetId ? byId.get(fields.magnetId) : undefined;
    if (!magnet || !sub.email) continue;

    // A flow only applies to opt-ins captured at/after it was set up — adding a
    // flow never retroactively emails people who signed up before it existed.
    if (magnet.followupsSetAt && sub.createdAt < magnet.followupsSetAt) continue;

    const followups = magnet.followups as LeadMagnetFollowup[];
    // Track sent follow-ups by their DELAY, not array position, so reordering or
    // removing one in the editor can't skip a survivor or re-send at a reused
    // index. (Two follow-ups sharing a delay would collapse — but that's a
    // nonsensical config anyway.)
    const already = Array.isArray(fields.followupsSent)
      ? fields.followupsSent
      : [];
    const lang: "en" | "uk" = fields.lang === "uk" ? "uk" : "en";

    // First un-sent follow-up whose delay has elapsed. One per tick.
    let fu: LeadMagnetFollowup | null = null;
    for (const candidate of followups) {
      const delay = candidate.delayHours ?? 0;
      if (already.includes(delay)) continue;
      const dueAt = sub.createdAt.getTime() + delay * 3_600_000;
      if (now >= dueAt) {
        fu = candidate;
        break;
      }
    }
    if (!fu) continue;

    const delay = fu.delayHours ?? 0;
    const subject = applyVars(
      pickLang(fu.subjectEn, fu.subjectUk, lang),
      sub.name
    );
    const body = applyVars(pickLang(fu.bodyEn, fu.bodyUk, lang), sub.name);
    if (!subject || !body) {
      // Nothing to send for this one — mark it done so we don't retry forever.
      await markSent(sub.id, fields, already, delay);
      continue;
    }

    const { practitionerName, replyTo } = await acctInfo(sub.accountId);
    try {
      await sendLeadMagnetFollowupEmail({
        to: sub.email,
        lang,
        subject,
        body,
        practitionerName,
        replyTo,
      });
      await markSent(sub.id, fields, already, delay);
      sent++;
    } catch (err) {
      console.error("[lead-magnet-nurture] send failed:", err);
      // Leave it unmarked — it retries next tick.
    }
  }

  return { candidates: subs.length, sent };
}

/** Record a sent follow-up (by its delayHours) in the opt-in's followupsSent
 *  bookkeeping, preserving every other key on the JSONB. */
async function markSent(
  submissionId: string,
  fields: Record<string, unknown>,
  already: number[],
  delay: number
): Promise<void> {
  await db
    .update(leadSubmissions)
    .set({ fields: { ...fields, followupsSent: [...already, delay] } })
    .where(eq(leadSubmissions.id, submissionId));
}
