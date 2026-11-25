// One offer on its own shareable page — /offer/<slug> (and /uk/offer/<slug>).
//
// Offers used to exist only as cards on the homepage ladder, so there was no
// link she could send for one thing ("the holiday gift session"). This page
// shows that offer and, for a contact-form offer, the inquiry form right
// under it — open times included — with every note tagged with the offer it
// came from, so it lands in her Inbox as "Asked about …". No auth (see
// proxy.ts PUBLIC_PREFIXES); bilingual via the /uk prefix like every other
// storefront page.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingOffers, practitionerSettings } from "@/db/schema";
import { PublicBrandLink } from "@/components/PublicBrandLink";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { LegalLinks } from "@/components/LegalLinks";
import {
  LandingLeadForm,
  type LandingWindow,
} from "@/components/LandingLeadForm";
import { getAvailableWindows } from "@/lib/availability";
import { listUpcomingPublicGroupSessions } from "@/lib/group-actions";
import { getLandingCopy } from "@/lib/landing-copy";
import { getLandingLang } from "@/lib/landing-lang";
import { offerForLang } from "@/lib/landing-offers";
import { resolveStorefrontAccountId } from "@/lib/storefront-account";
import { localePath, storefrontAlternates } from "@/lib/storefront-seo";
import { resolveTimeZone } from "@/lib/timezone";
import "../../landing.css";

export const dynamic = "force-dynamic";

async function loadOffer(slug: string) {
  const accountId = await resolveStorefrontAccountId();
  if (!accountId) return null;
  const [row] = await db
    .select({
      id: landingOffers.id,
      slug: landingOffers.slug,
      stepEn: landingOffers.stepEn,
      stepUk: landingOffers.stepUk,
      titleEn: landingOffers.titleEn,
      titleUk: landingOffers.titleUk,
      priceEn: landingOffers.priceEn,
      priceUk: landingOffers.priceUk,
      priceSuffixEn: landingOffers.priceSuffixEn,
      priceSuffixUk: landingOffers.priceSuffixUk,
      descriptionEn: landingOffers.descriptionEn,
      descriptionUk: landingOffers.descriptionUk,
      ctaEn: landingOffers.ctaEn,
      ctaUk: landingOffers.ctaUk,
      linkKind: landingOffers.linkKind,
      customHref: landingOffers.customHref,
      variant: landingOffers.variant,
      rowId: landingOffers.rowId,
      page: landingOffers.page,
    })
    .from(landingOffers)
    .where(
      and(
        eq(landingOffers.accountId, accountId),
        eq(landingOffers.slug, slug.toLowerCase()),
        eq(landingOffers.published, true)
      )
    )
    .limit(1);
  return row ? { accountId, row } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lang = await getLandingLang();
  const found = await loadOffer(slug);
  if (!found) return { title: lang === "uk" ? "Пропозиція" : "An offer" };
  const offer = offerForLang(found.row, lang, "#contact");
  return {
    title: offer.title,
    description: offer.description.slice(0, 160) || undefined,
    alternates: storefrontAlternates(`/offer/${found.row.slug}`, lang),
  };
}

function formatWindowLabel(d: Date, locale: string, timeZone: string): string {
  return d.toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

export default async function OfferSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lang = await getLandingLang();
  const found = await loadOffer(slug);
  if (!found) notFound();
  const { accountId, row } = found;
  const c = getLandingCopy(lang);
  const isContact = !row.linkKind || row.linkKind === "contact";

  // Where a non-form offer's button goes; a Circle offer resolves to the
  // soonest open Circle, else the contact form — same as the homepage.
  let circleHref = "#contact";
  let availableWindows: LandingWindow[] = [];
  try {
    const [cfg] = await db
      .select({
        circleSignupsOpen: practitionerSettings.circleSignupsOpen,
        showAvailability: practitionerSettings.showAvailabilityPublicly,
        timezone: practitionerSettings.timezone,
      })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, accountId))
      .limit(1);
    if (row.linkKind === "circle" && cfg?.circleSignupsOpen) {
      const upcoming = await listUpcomingPublicGroupSessions(4, accountId);
      const open = upcoming.find((u) => u.capacity - u.spotsTaken > 0);
      if (open) circleHref = `/circles/${open.sessionId}`;
    }
    if (isContact && cfg?.showAvailability) {
      const tz = resolveTimeZone(cfg.timezone);
      const windows = await getAvailableWindows(accountId, { limit: 6 });
      availableWindows = windows.map((w) => ({
        startAt: w.startAt.toISOString(),
        endAt: w.endAt.toISOString(),
        label: formatWindowLabel(w.startAt, c.circles.dateLocale, tz),
      }));
    }
  } catch (err) {
    // Times and Circle links are extras — the offer and form still render.
    console.warn("[offer] extras failed:", err);
  }

  const offer = offerForLang(row, lang, circleHref);
  const paragraphs = offer.description
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  // A non-form offer's button: "#contact" is the homepage form, anything else
  // is a page (localized where it exists in both languages) or a full URL.
  const ctaHref = offer.href.startsWith("#")
    ? localePath(lang, `/${offer.href}`)
    : offer.href.startsWith("/")
      ? localePath(lang, offer.href)
      : offer.href;

  return (
    <>
      <TimeOfDayProvider />
      <GoogleAnalytics />
      <main className="landing-root">
        <header
          style={{
            padding: "32px 24px 0",
            maxWidth: 720,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <PublicBrandLink lang={lang} />
        </header>

        <section className="ways" style={{ padding: "44px 24px 24px" }}>
          {/* One card, full width of a narrow column — the homepage's .lane
              is a 3-up grid, which squeezed a lone card into a third. */}
          <div className="wrap ladder" style={{ maxWidth: 520, marginTop: 0 }}>
            <div className="lane" style={{ gridTemplateColumns: "1fr" }}>
              <div
                className={`card${
                  offer.variant === "free"
                    ? " free"
                    : offer.variant === "feature"
                      ? " feat"
                      : ""
                }`}
              >
                {offer.step && <span className="step">{offer.step}</span>}
                <h3>{offer.title}</h3>
                {offer.price && (
                  <div className="price">
                    {offer.price}
                    {offer.priceSuffix && <small> {offer.priceSuffix}</small>}
                  </div>
                )}
                {paragraphs.map((p, i) => (
                  <p className="desc" key={i}>
                    {p}
                  </p>
                ))}
                {!isContact && offer.cta && (
                  <a href={ctaHref} className="cta">
                    {offer.cta}
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {isContact && (
          <section className="contact" id="contact">
            <div className="wrap narrow" style={{ textAlign: "center" }}>
              <span className="tag" style={{ display: "block" }}>
                {c.offerPage.formTag}
              </span>
              <h2>{c.offerPage.formTitle}</h2>
              <p className="p-lg">{c.offerPage.formBody}</p>
            </div>
            <div className="form-shell">
              <LandingLeadForm
                availableWindows={availableWindows}
                copy={c.form}
                lang={lang === "uk" ? "uk" : "en"}
                offerId={row.id}
              />
            </div>
          </section>
        )}

        <p style={{ textAlign: "center", margin: "8px 0 40px", fontSize: 14 }}>
          <Link href={localePath(lang, "/#ways")}>{c.offerPage.seeAll}</Link>
        </p>
        <LegalLinks lang={lang} />
      </main>
    </>
  );
}
