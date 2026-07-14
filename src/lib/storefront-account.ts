import { db } from "@/db";
import { practitionerSettings, accounts, sessions, clients } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * Resolve the single account that owns the PUBLIC storefront (svit.live).
 *
 * Soul Service is designed as one-practitioner-per-deployment, but the shared
 * Neon database can hold several accounts (a legacy import, a sandbox, the
 * real practitioner). The storefront queries used to grab practitioner_settings
 * with a naive `.limit(1)` and no WHERE — so once more than one account
 * existed, they read an arbitrary row. That's how svit.live ended up showing an
 * empty "Legacy data" account's settings (blank portrait, sign-ups toggle,
 * availability) instead of Svitlana's, and how landing leads would have filed
 * under the wrong account.
 *
 * This is the single source of truth for "who is the storefront." Resolution
 * order, first hit wins:
 *   1. LANDING_ACCOUNT_ID env — an explicit account UUID. Hard pin; set this
 *      in Vercel to make the choice permanent regardless of data.
 *   2. LANDING_ACCOUNT_EMAIL env — resolved to that account's id.
 *   3. Deterministic fallback — the account with the most real activity
 *      (sessions, then clients, then most-recently-updated settings). Picks the
 *      true practitioner with zero configuration, and is stable because the
 *      real account always has the data.
 *
 * Never throws for the caller's sake it's wrapped, but returns null only if
 * there are genuinely no practitioner_settings rows.
 */
export async function resolveStorefrontAccountId(): Promise<string | null> {
  const envId = process.env.LANDING_ACCOUNT_ID?.trim();
  if (envId) return envId;

  const envEmail = process.env.LANDING_ACCOUNT_EMAIL?.trim().toLowerCase();
  if (envEmail) {
    const [row] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(sql`LOWER(${accounts.email}) = ${envEmail}`)
      .limit(1);
    if (row?.id) return row.id;
  }

  const rows = await db
    .select({
      accountId: practitionerSettings.accountId,
      updatedAt: practitionerSettings.updatedAt,
      sessionCount: sql<number>`(SELECT COUNT(*)::int FROM ${sessions} WHERE ${sessions.accountId} = ${practitionerSettings.accountId})`,
      clientCount: sql<number>`(SELECT COUNT(*)::int FROM ${clients} WHERE ${clients.accountId} = ${practitionerSettings.accountId})`,
    })
    .from(practitionerSettings);

  if (rows.length === 0) return null;

  rows.sort(
    (a, b) =>
      (b.sessionCount ?? 0) - (a.sessionCount ?? 0) ||
      (b.clientCount ?? 0) - (a.clientCount ?? 0) ||
      (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
  );
  return rows[0].accountId;
}
