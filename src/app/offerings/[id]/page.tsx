// Public offering page — the storefront-side detail for a single video
// product. Shows the title, description, price, and a request-to-buy
// form. No video preview yet (Cloudflare Stream supports clipping, but
// that's a v2 feature).

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { PurchaseRequestForm } from "@/components/PurchaseRequestForm";
import "../../landing.css";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default async function OfferingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, id),
        eq(products.published, true),
        isNull(products.archivedAt)
      )
    )
    .limit(1);
  const product = rows[0];
  if (!product) notFound();

  const ready = !!product.videoUploadedAt;
  const priceLabel = formatMoney(product.priceCents, product.currency);

  return (
    <>
      <TimeOfDayProvider />
      <main className="landing-root">
        <header
          style={{
            padding: "32px 24px 0",
            maxWidth: 720,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-serif, serif)",
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: "var(--land-clay-deep)",
              textDecoration: "none",
            }}
          >
            Svitlana
          </Link>
        </header>

        <section
          className="circles"
          style={{ padding: "60px 24px 80px" }}
        >
          <div
            className="wrap narrow"
            style={{ textAlign: "center" }}
          >
            <span className="tag" style={{ display: "block" }}>
              An offering
            </span>
            <h2 style={{ marginBottom: 12 }}>{product.name}</h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--land-ink-soft)",
                fontFamily: "var(--font-mono, monospace)",
                letterSpacing: "0.04em",
              }}
            >
              {priceLabel}
              {product.videoDurationSeconds !== null && (
                <> · {Math.round((product.videoDurationSeconds ?? 0) / 60)}min</>
              )}
            </p>

            {product.description && (
              <p
                className="p-lg"
                style={{
                  marginTop: 22,
                  fontSize: 16,
                  fontStyle: "italic",
                  fontFamily: "var(--font-serif, serif)",
                  lineHeight: 1.55,
                }}
              >
                {product.description}
              </p>
            )}
          </div>

          <div
            className="form-shell"
            style={{
              maxWidth: 520,
              margin: "40px auto 0",
            }}
          >
            {ready ? (
              <PurchaseRequestForm
                productId={product.id}
                productName={product.name}
                priceLabel={priceLabel}
                paymentInstructions={product.paymentInstructions}
              />
            ) : (
              <div
                className="rounded-md"
                style={{
                  padding: 24,
                  textAlign: "center",
                  background: "rgba(255, 251, 245, 0.7)",
                  border: "1px solid rgba(176, 92, 54, 0.18)",
                }}
              >
                <p
                  className="serif-italic"
                  style={{
                    fontSize: 18,
                    color: "var(--land-clay-deep)",
                    marginBottom: 8,
                  }}
                >
                  Almost ready.
                </p>
                <p style={{ fontSize: 13 }}>
                  This offering is still being finalized. Check back soon, or{" "}
                  <Link
                    href="/#contact"
                    style={{
                      color: "var(--land-clay)",
                      textDecoration: "underline",
                    }}
                  >
                    send a note
                  </Link>{" "}
                  if you&apos;d like to hear when it&apos;s up.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
