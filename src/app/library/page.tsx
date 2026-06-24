// Practitioner library — list of video offerings (workshop replays,
// courses, anything she sells as on-demand video). Sidebar nav "Library."

import Link from "next/link";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { db } from "@/db";
import { products, productPurchases } from "@/db/schema";
import { getSettings, listClientsForPicker } from "@/db/queries";
import { asLocale } from "@/lib/i18n";
import { NewProductDialog } from "@/components/NewProductDialog";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default async function LibraryPage() {
  const { email, accountId } = await requireSession();

  const [rows, settings, clientsList] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        priceCents: products.priceCents,
        currency: products.currency,
        videoUploadedAt: products.videoUploadedAt,
        videoDurationSeconds: products.videoDurationSeconds,
        published: products.published,
        purchaseCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${productPurchases}
          WHERE ${productPurchases.productId} = ${products.id}
            AND ${productPurchases.status} = 'confirmed'
        )`,
        pendingCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${productPurchases}
          WHERE ${productPurchases.productId} = ${products.id}
            AND ${productPurchases.status} = 'pending'
        )`,
      })
      .from(products)
      .where(and(eq(products.accountId, accountId), isNull(products.archivedAt)))
      .orderBy(desc(products.createdAt)),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);

  const locale = asLocale(settings.uiLanguage);

  return (
    <AppShell
      breadcrumb={[{ label: "Library" }]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={email}
      locale={locale}
    >
      <header className="mb-7 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1
            className="text-3xl md:text-4xl text-ink-900 serif mb-1"
            style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
          >
            Library
          </h1>
          <p className="text-sm text-ink-500 italic serif-italic">
            Recorded workshops and on-demand offerings.
          </p>
        </div>
        <NewProductDialog />
      </header>

      {rows.length === 0 ? (
        <div className="paper-card p-10 text-center max-w-xl mx-auto">
          <p
            className="serif-italic text-lg text-plum-700 mb-2"
            style={{ fontWeight: 400 }}
          >
            No offerings yet.
          </p>
          <p className="text-sm text-ink-500 leading-relaxed">
            Click <strong>New offering</strong> to add a recorded workshop or
            replay. After uploading the video, publish it to surface on your
            storefront.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          {rows.map((p) => (
            <Link
              key={p.id}
              href={`/library/${p.id}`}
              className="paper-card p-5 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <h2
                  className="serif text-xl text-ink-900"
                  style={{ fontWeight: 500 }}
                >
                  {p.name}
                </h2>
                {!p.published && (
                  <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-ink-100 text-ink-500">
                    Draft
                  </span>
                )}
                {p.published && !p.videoUploadedAt && (
                  <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-honey-100 text-honey-700">
                    Awaiting video
                  </span>
                )}
              </div>
              {p.description && (
                <p className="text-sm text-ink-600 italic mb-3 line-clamp-2">
                  {p.description}
                </p>
              )}
              <div className="text-[12px] text-ink-500 font-mono flex items-center gap-3 flex-wrap mt-3">
                <span>{formatMoney(p.priceCents, p.currency)}</span>
                {p.videoDurationSeconds !== null && (
                  <>
                    <span>·</span>
                    <span>
                      {Math.round((p.videoDurationSeconds ?? 0) / 60)}min
                    </span>
                  </>
                )}
              </div>
              <div className="mt-3 text-[12px] text-plum-700 flex items-center gap-3 flex-wrap">
                <span>
                  {p.purchaseCount} sold
                  {p.pendingCount > 0 && (
                    <span className="text-honey-700 ml-1">
                      · {p.pendingCount} pending
                    </span>
                  )}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
