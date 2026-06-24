// Practitioner-side product detail. Edit basics, upload/replace video,
// preview the live storefront, review purchases.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { db } from "@/db";
import { products, productPurchases } from "@/db/schema";
import { getSettings, listClientsForPicker } from "@/db/queries";
import { asLocale } from "@/lib/i18n";
import {
  updateProduct,
  archiveProduct,
  getWatchAccess,
} from "@/lib/product-actions";
import { ProductVideoUploadButton } from "@/components/ProductVideoUploadButton";
import { ProductPurchaseRow } from "@/components/ProductPurchaseRow";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

void getWatchAccess; // silence unused import; getWatchAccess is used by /watch page

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

async function doArchive(formData: FormData): Promise<void> {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await archiveProduct(id);
  revalidatePath("/library");
  redirect("/library");
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { email, accountId } = await requireSession();
  const { id } = await params;

  const [productRow, settings, clientsList] = await Promise.all([
    db
      .select()
      .from(products)
      .where(and(eq(products.accountId, accountId), eq(products.id, id)))
      .limit(1),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);
  const product = productRow[0];
  if (!product) notFound();

  const locale = asLocale(settings.uiLanguage);

  const purchases = await db
    .select()
    .from(productPurchases)
    .where(eq(productPurchases.productId, product.id))
    .orderBy(desc(productPurchases.createdAt));

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  const baseUrl = `${proto}://${host}`;
  const offeringUrl = `${baseUrl}/offerings/${product.id}`;

  const hasVideo = !!product.videoId && !!product.videoUploadedAt;
  const videoPending = !!product.videoId && !product.videoUploadedAt;

  const pending = purchases.filter((p) => p.status === "pending");
  const confirmed = purchases.filter((p) => p.status === "confirmed");
  const refunded = purchases.filter((p) => p.status === "refunded");

  return (
    <AppShell
      breadcrumb={[
        { label: "Library", href: "/library" },
        { label: product.name },
      ]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={email}
      locale={locale}
    >
      <header className="mb-7 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1
            className="text-3xl md:text-4xl text-ink-900 serif mb-1"
            style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
          >
            {product.name}
            {!product.published && (
              <span className="ml-3 align-middle text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-ink-100 text-ink-500">
                Draft
              </span>
            )}
          </h1>
          {product.description && (
            <p className="text-sm text-ink-600 italic serif-italic mt-1 max-w-2xl">
              {product.description}
            </p>
          )}
          <div className="text-[12px] text-ink-500 font-mono flex items-center gap-3 flex-wrap mt-3">
            <span>{formatMoney(product.priceCents, product.currency)}</span>
            {product.videoDurationSeconds !== null && (
              <>
                <span>·</span>
                <span>
                  {Math.round((product.videoDurationSeconds ?? 0) / 60)}min
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Video upload + status */}
      <section className="paper-card p-5 mb-6 max-w-2xl">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="text-[10px] uppercase tracking-wider font-mono text-ink-500">
            Video
          </div>
          <ProductVideoUploadButton
            productId={product.id}
            hasExisting={hasVideo}
          />
        </div>
        {hasVideo && (
          <p className="text-xs text-ink-600">
            Uploaded {new Date(product.videoUploadedAt!).toLocaleString()}.
            Buyers see this after you mark them paid.
          </p>
        )}
        {videoPending && (
          <p className="text-xs text-honey-700 italic">
            Upload in progress or processing. Reload in a minute.
          </p>
        )}
        {!hasVideo && !videoPending && (
          <p className="text-xs text-ink-500 italic">
            No video uploaded yet. The offering can&apos;t be purchased until
            you upload one.
          </p>
        )}
      </section>

      {/* Edit basics */}
      <section className="paper-card p-5 mb-6 max-w-2xl">
        <h2
          className="serif text-lg text-ink-900 mb-3"
          style={{ fontWeight: 500 }}
        >
          Details
        </h2>
        <form action={updateProduct} className="space-y-3">
          <input type="hidden" name="id" value={product.id} />
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Name
            </span>
            <input
              type="text"
              name="name"
              required
              defaultValue={product.name}
              maxLength={200}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Description
            </span>
            <textarea
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={product.description ?? ""}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white resize-y"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Price ($)
            </span>
            <input
              type="number"
              name="price"
              min={0}
              step={1}
              defaultValue={(product.priceCents / 100).toFixed(2)}
              className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
              Payment instructions
            </span>
            <textarea
              name="paymentInstructions"
              rows={2}
              maxLength={1000}
              defaultValue={product.paymentInstructions ?? ""}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white resize-y"
            />
          </label>
          <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
            <input
              type="checkbox"
              name="published"
              value="true"
              defaultChecked={product.published}
              className="rounded border-ink-300 mt-0.5"
            />
            <span className="text-sm text-ink-700 leading-snug">
              Publish on storefront
              <span className="block text-[11px] text-ink-500 italic mt-0.5">
                Off keeps it hidden from svit.live. Off + draft = nothing
                public; on = card appears in the Library section.
              </span>
            </span>
          </label>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium"
            >
              Save
            </button>
          </div>
        </form>
      </section>

      {/* Storefront link + archive */}
      <section className="paper-card p-5 mb-7 max-w-2xl">
        <div className="text-[10px] uppercase tracking-wider font-mono text-ink-500 mb-1">
          Public offering URL
        </div>
        <Link
          href={`/offerings/${product.id}`}
          target="_blank"
          className="text-[13px] text-plum-700 hover:underline break-all"
        >
          {offeringUrl}
        </Link>
        <form action={doArchive} className="mt-4">
          <input type="hidden" name="id" value={product.id} />
          <button
            type="submit"
            className="text-[11px] text-ink-500 hover:text-rose-700"
          >
            Archive offering (deletes the video too)
          </button>
        </form>
      </section>

      {/* Purchases */}
      <section className="max-w-3xl">
        <h2
          className="serif text-xl text-ink-900 mb-3"
          style={{ fontWeight: 500 }}
        >
          Purchases
        </h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-ink-500 italic">
            No purchases yet. Once buyers request this offering, they&apos;ll
            appear here for you to confirm + mark paid.
          </p>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-mono text-honey-700 mb-2">
                  Awaiting confirmation
                </div>
                <div className="space-y-2">
                  {pending.map((p) => (
                    <ProductPurchaseRow
                      key={p.id}
                      baseUrl={baseUrl}
                      purchase={{
                        id: p.id,
                        name: p.purchaserName,
                        email: p.purchaserEmail,
                        phone: p.purchaserPhone,
                        status: p.status,
                        paid: p.paid,
                        createdAt: new Date(p.createdAt),
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            {confirmed.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-mono text-sage-700 mb-2">
                  Confirmed
                </div>
                <div className="space-y-2">
                  {confirmed.map((p) => (
                    <ProductPurchaseRow
                      key={p.id}
                      baseUrl={baseUrl}
                      purchase={{
                        id: p.id,
                        name: p.purchaserName,
                        email: p.purchaserEmail,
                        phone: p.purchaserPhone,
                        status: p.status,
                        paid: p.paid,
                        createdAt: new Date(p.createdAt),
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            {refunded.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-mono text-ink-500 mb-2">
                  Refunded
                </div>
                <div className="space-y-2">
                  {refunded.map((p) => (
                    <ProductPurchaseRow
                      key={p.id}
                      baseUrl={baseUrl}
                      purchase={{
                        id: p.id,
                        name: p.purchaserName,
                        email: p.purchaserEmail,
                        phone: p.purchaserPhone,
                        status: p.status,
                        paid: p.paid,
                        createdAt: new Date(p.createdAt),
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
