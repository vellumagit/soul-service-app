// Public watch page for a confirmed product purchase. URL pattern:
//   /watch/[purchaseId]?token=ACCESS_TOKEN
// The token is the random secret sent in the buyer's confirmation email.
// We validate it server-side and mint a 24h signed Cloudflare URL on each
// page render. If the purchase is refunded, getWatchAccess() returns null
// and we show a polite "no longer accessible" message.

import Link from "next/link";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { RecapPlayer } from "@/components/RecapPlayer";
import { getWatchAccess } from "@/lib/product-actions";
import { getSignedPlaybackIframeUrl } from "@/lib/cloudflare-stream";
import "../../landing.css";

export const dynamic = "force-dynamic";

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  const access = await getWatchAccess(id, token ?? "");

  return (
    <>
      <TimeOfDayProvider />
      <main className="landing-root">
        <header
          style={{
            padding: "32px 24px 0",
            maxWidth: 900,
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
          style={{ padding: "40px 24px 80px" }}
        >
          {!access || !access.videoId ? (
            <div
              className="wrap narrow rv"
              style={{ textAlign: "center" }}
            >
              <span className="tag" style={{ display: "block" }}>
                Watch
              </span>
              <h2 style={{ marginBottom: 12 }}>This link is no longer active.</h2>
              <p className="p-lg">
                If you think this is a mistake, send a note via{" "}
                <Link
                  href="/#contact"
                  style={{
                    color: "var(--land-clay)",
                    textDecoration: "underline",
                  }}
                >
                  the contact form
                </Link>{" "}
                and Svitlana will sort it out.
              </p>
            </div>
          ) : (
            <WatchBody
              videoId={access.videoId}
              productName={access.productName}
              productDescription={access.productDescription}
            />
          )}
        </section>
      </main>
    </>
  );
}

async function WatchBody({
  videoId,
  productName,
  productDescription,
}: {
  videoId: string;
  productName: string;
  productDescription: string | null;
}) {
  let url: string | null = null;
  try {
    url = await getSignedPlaybackIframeUrl(videoId);
  } catch (err) {
    console.error("[watch] signed url mint failed", err);
  }
  return (
    <div
      className="wrap rv"
      style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}
    >
      <span className="tag" style={{ display: "block" }}>
        Now playing
      </span>
      <h2 style={{ marginBottom: 12 }}>{productName}</h2>
      {productDescription && (
        <p className="p-lg" style={{ maxWidth: 600, margin: "0 auto 28px" }}>
          {productDescription}
        </p>
      )}
      {url ? (
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <RecapPlayer signedUrl={url} title={productName} />
        </div>
      ) : (
        <div
          className="rounded-md"
          style={{
            padding: 24,
            textAlign: "center",
            background: "rgba(255, 251, 245, 0.7)",
            border: "1px solid rgba(176, 92, 54, 0.18)",
            maxWidth: 520,
            margin: "0 auto",
          }}
        >
          <p
            className="serif-italic"
            style={{
              fontSize: 16,
              color: "var(--land-clay-deep)",
              marginBottom: 8,
            }}
          >
            We couldn&apos;t load the video right now.
          </p>
          <p style={{ fontSize: 13 }}>
            Reload this page in a moment. If it still doesn&apos;t work,{" "}
            <Link
              href="/#contact"
              style={{
                color: "var(--land-clay)",
                textDecoration: "underline",
              }}
            >
              reach out
            </Link>{" "}
            and Svitlana will help.
          </p>
        </div>
      )}
      <p
        style={{
          fontSize: 11,
          fontStyle: "italic",
          color: "var(--land-ink-soft)",
          marginTop: 24,
          fontFamily: "var(--font-serif, serif)",
        }}
      >
        This link is private to you. The player refreshes every 24 hours —
        reload the page if it stops playing.
      </p>
    </div>
  );
}
