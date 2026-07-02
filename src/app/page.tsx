// Public landing page — the svit.live storefront. Always public, always
// renders here (no auth redirect; see proxy.ts). Bilingual: English by
// default, Ukrainian via the EN·УКР toggle in the nav. All visible copy
// comes from src/lib/landing-copy.tsx; the chosen language is read from the
// `landing_lang` cookie via getLandingLang().

import Link from "next/link";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import {
  LandingLeadForm,
  type LandingWindow,
} from "@/components/LandingLeadForm";
import { LandingReveal } from "@/components/LandingReveal";
import { SecretSignInWordmark } from "@/components/SecretSignInWordmark";
import { LandingLangToggle } from "@/components/LandingLangToggle";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";
import { getAvailableWindows } from "@/lib/availability";
import { listUpcomingPublicGroupSessions } from "@/lib/group-actions";
import { listPublishedProducts } from "@/lib/product-actions";
import { getLandingCopy } from "@/lib/landing-copy";
import { getLandingLang } from "@/lib/landing-lang";
import "./landing.css";

function formatLandingWindowLabel(d: Date, locale: string): string {
  return d.toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  // The marketing homepage is ALWAYS public and ALWAYS renders here — it
  // never auto-redirects signed-in users. Svit reaches her workspace via
  // the "Sign in" link in the nav (→ /signin → /today); clients reach
  // theirs the same way (→ /portal).

  const lang = await getLandingLang();
  const c = getLandingCopy(lang);

  // Pull next available windows for the inquiry form — but ONLY when the
  // practitioner has opted in (Settings → Availability). Off → free-text
  // form only.
  let availableWindows: LandingWindow[] = [];
  // Master switch: when Circle sign-ups are closed, the storefront hides the
  // "Upcoming Circles" section entirely (pricing + contact only).
  let circleSignupsOpen = false;
  // Portrait photo for the About section. Blank → the gradient placeholder.
  let portraitUrl: string | null = null;
  try {
    const settingsRow = await db
      .select({
        accountId: practitionerSettings.accountId,
        showAvailability: practitionerSettings.showAvailabilityPublicly,
        circleSignupsOpen: practitionerSettings.circleSignupsOpen,
        landingPortraitUrl: practitionerSettings.landingPortraitUrl,
      })
      .from(practitionerSettings)
      .limit(1);
    const cfg = settingsRow[0];
    circleSignupsOpen = cfg?.circleSignupsOpen ?? false;
    portraitUrl = cfg?.landingPortraitUrl?.trim() || null;
    if (cfg?.showAvailability) {
      const windows = await getAvailableWindows(cfg.accountId, { limit: 6 });
      availableWindows = windows.map((w) => ({
        startAt: w.startAt.toISOString(),
        endAt: w.endAt.toISOString(),
        label: formatLandingWindowLabel(w.startAt, c.circles.dateLocale),
      }));
    }
  } catch (err) {
    // Availability is a nice-to-have; never let it break the storefront.
    console.warn("[landing] availability fetch failed:", err);
  }

  // Upcoming public group sessions (Circles). Empty → section hidden.
  let upcomingCircles: Awaited<
    ReturnType<typeof listUpcomingPublicGroupSessions>
  > = [];
  try {
    upcomingCircles = await listUpcomingPublicGroupSessions(4);
  } catch (err) {
    console.warn("[landing] upcoming circles fetch failed:", err);
  }

  // Library — published video offerings. Same try/catch pattern.
  let libraryProducts: Awaited<
    ReturnType<typeof listPublishedProducts>
  > = [];
  try {
    libraryProducts = await listPublishedProducts(6);
  } catch (err) {
    console.warn("[landing] library fetch failed:", err);
  }

  return (
    <>
      <TimeOfDayProvider />
      <LandingReveal />
      <div className="landing-root">
        {/* nav */}
        <nav className="lnav">
          <div className="inner">
            {/* The wordmark is also a secret door: triple-tap → /signin
                (practitioner workspace). Invisible to visitors. */}
            <SecretSignInWordmark />
            <div className="nav-actions">
              <LandingLangToggle current={lang} />
              <Link href="/signin" className="nav-signin nav-hide-narrow">
                {c.nav.signIn}
              </Link>
              <a href="#contact" className="nav-signin">
                {c.nav.reachOut}
              </a>
              <a href="#ways" className="navcta">
                {c.nav.workWithMe}
              </a>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <header className="hero">
          <div className="wrap">
            <svg
              className="compass"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="46" stroke="#B05C36" strokeWidth="1.5" />
              <circle
                cx="50"
                cy="50"
                r="38"
                stroke="#C99A5B"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
              <path d="M50 16 L57 50 L50 84 L43 50 Z" fill="#B05C36" opacity="0.9" />
              <path d="M50 16 L57 50 L50 50 Z" fill="#8F4727" />
              <circle cx="50" cy="50" r="4" fill="#2B2823" />
            </svg>
            <p className="eyebrow">{c.hero.eyebrow}</p>
            <h1>{c.hero.title}</h1>
            <p className="sub">{c.hero.sub}</p>
            <div className="btns">
              <a href="#ways" className="btn btn-pri">
                {c.hero.btnPrimary} <span className="ar">→</span>
              </a>
              <a href="#contact" className="btn btn-ghost">
                {c.hero.btnGhost}
              </a>
            </div>
          </div>
        </header>

        {/* THE ACHE */}
        <section className="ache">
          <div className="wrap narrow rv">
            <span className="tag">{c.ache.tag}</span>
            <h2>{c.ache.title}</h2>
            <p className="p-lg">{c.ache.body}</p>
          </div>
          <div className="wrap feelings">
            <div className="feel rv">
              <p>&ldquo;{c.ache.feel1}&rdquo;</p>
            </div>
            <div className="feel rv">
              <p>&ldquo;{c.ache.feel2}&rdquo;</p>
            </div>
            <div className="feel rv">
              <p>&ldquo;{c.ache.feel3}&rdquo;</p>
            </div>
          </div>
        </section>

        {/* REFRAME */}
        <section>
          <div className="wrap narrow">
            <div className="rv" style={{ textAlign: "center" }}>
              <span className="tag">{c.reframe.tag}</span>
            </div>
            <p className="pull rv">{c.reframe.pull}</p>
            <p
              className="p rv"
              style={{
                textAlign: "center",
                maxWidth: "38em",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {c.reframe.body}
            </p>
            <p className="signature rv">{c.reframe.signature}</p>
          </div>
        </section>

        {/* ABOUT */}
        <section className="about">
          <div className="wrap about-grid">
            <div className="portrait rv">
              {portraitUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={portraitUrl} alt={c.about.tag} />
              ) : (
                <span>{c.about.portraitPlaceholder}</span>
              )}
            </div>
            <div className="rv">
              <span className="tag">{c.about.tag}</span>
              <h2>{c.about.title}</h2>
              <p className="p">{c.about.p1}</p>
              <p className="p">{c.about.p2}</p>
            </div>
          </div>
        </section>

        {/* WAYS TO WORK */}
        <section className="ways" id="ways">
          <div className="wrap narrow rv">
            <span className="tag" style={{ display: "block" }}>
              {c.ways.tag}
            </span>
            <h2>{c.ways.title}</h2>
            <p className="p-lg">{c.ways.body}</p>
          </div>

          <div className="wrap ladder">
            {/* entry lane */}
            <div className="lane">
              <div className="card free coming-soon rv">
                <span className="step">{c.ways.quiz.step}</span>
                <h3>{c.ways.quiz.title}</h3>
                <div className="price">{c.ways.quiz.price}</div>
                <p className="desc">{c.ways.quiz.desc}</p>
                <span className="cta cta-soon" aria-disabled="true">
                  {c.ways.quiz.cta}
                </span>
              </div>
              <div className="card rv">
                <span className="step">{c.ways.circle.step}</span>
                <h3>{c.ways.circle.title}</h3>
                <div className="price">
                  {c.ways.circle.price} <small>{c.ways.perSession}</small>
                </div>
                <p className="desc">{c.ways.circle.desc}</p>
                <a href="#contact" className="cta">
                  {c.ways.circle.cta}
                </a>
              </div>
              <div className="card rv">
                <span className="step">{c.ways.single.step}</span>
                <h3>{c.ways.single.title}</h3>
                <div className="price">{c.ways.single.price}</div>
                <p className="desc">{c.ways.single.desc}</p>
                <a href="#contact" className="cta">
                  {c.ways.single.cta}
                </a>
              </div>
            </div>

            {/* deep lane */}
            <div className="lane">
              <div className="card rv">
                <span className="step">{c.ways.retainer.step}</span>
                <h3>{c.ways.retainer.title}</h3>
                <div className="price">
                  {c.ways.retainer.price} <small>{c.ways.perMonth}</small>
                </div>
                <p className="desc">{c.ways.retainer.desc}</p>
                <a href="#contact" className="cta">
                  {c.ways.retainer.cta}
                </a>
              </div>
              <div className="card feat rv">
                <span className="step">{c.ways.journey.step}</span>
                <h3>{c.ways.journey.title}</h3>
                <div className="price">
                  {c.ways.journey.price} <small>{c.ways.per3Months}</small>
                </div>
                <p className="desc">{c.ways.journey.desc}</p>
                <a href="#contact" className="cta">
                  {c.ways.journey.cta}
                </a>
              </div>
              <div className="card rv">
                <span className="step">{c.ways.talk.step}</span>
                <h3>{c.ways.talk.title}</h3>
                <div className="price">
                  {c.ways.talk.price} <small>{c.ways.aRealConversation}</small>
                </div>
                <p className="desc">{c.ways.talk.desc}</p>
                <a href="#contact" className="cta">
                  {c.ways.talk.cta}
                </a>
              </div>
            </div>
            <p className="ladder-note">{c.ways.note}</p>
          </div>
        </section>

        {/* VOICES */}
        <section className="voices">
          <div className="wrap narrow rv" style={{ textAlign: "center" }}>
            <span className="tag" style={{ display: "block" }}>
              {c.voices.tag}
            </span>
            <h2>{c.voices.title}</h2>
          </div>
          <div className="wrap vgrid">
            <div className="voice rv">
              <p>&ldquo;{c.voices.v1}&rdquo;</p>
              <div className="who">{c.voices.v1who}</div>
            </div>
            <div className="voice rv">
              <p>&ldquo;{c.voices.v2}&rdquo;</p>
              <div className="who">{c.voices.v2who}</div>
            </div>
            <div className="voice rv">
              <p>&ldquo;{c.voices.v3}&rdquo;</p>
              <div className="who">{c.voices.v3who}</div>
            </div>
            <div className="voice rv">
              <p>&ldquo;{c.voices.v4}&rdquo;</p>
              <div className="who">{c.voices.v4who}</div>
            </div>
          </div>
        </section>

        {/* UPCOMING CIRCLES — only when sign-ups are open AND there are any.
            While closed, the storefront stays info + pricing + contact; the
            "Ways to work together" ladder still shows Circle pricing and
            routes to the contact form. */}
        {circleSignupsOpen && upcomingCircles.length > 0 && (
          <section className="circles" id="circles">
            <div className="wrap narrow rv" style={{ textAlign: "center" }}>
              <span className="tag" style={{ display: "block" }}>
                {c.circles.tag}
              </span>
              <h2>{c.circles.title}</h2>
              <p className="p-lg">{c.circles.body}</p>
            </div>
            <div className="wrap circles-grid">
              {upcomingCircles.map((circle) => {
                const spotsLeft = Math.max(
                  0,
                  circle.capacity - circle.spotsTaken
                );
                const when = circle.scheduledAt.toLocaleString(
                  c.circles.dateLocale,
                  {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }
                );
                return (
                  <div className="circle-card rv" key={circle.sessionId}>
                    <h3>{circle.groupName}</h3>
                    <div className="when">{when}</div>
                    <div className="meta">
                      {circle.durationMinutes}
                      {c.circles.minShort}
                      <span className="dot" aria-hidden>
                        ·
                      </span>
                      {spotsLeft > 0
                        ? c.circles.seatsLeft(spotsLeft)
                        : c.circles.full}
                      {circle.topic && (
                        <>
                          <span className="dot" aria-hidden>
                            ·
                          </span>
                          <em>{circle.topic}</em>
                        </>
                      )}
                    </div>
                    {circle.groupDescription && (
                      <p className="desc">{circle.groupDescription}</p>
                    )}
                    <div className="price">
                      {new Intl.NumberFormat(c.circles.dateLocale, {
                        style: "currency",
                        currency: circle.currency,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      }).format(circle.priceCents / 100)}
                    </div>
                    {spotsLeft > 0 ? (
                      <Link href={`/circles/${circle.sessionId}`} className="cta">
                        {c.circles.holdSeat}
                      </Link>
                    ) : (
                      <span className="cta cta-full">
                        {c.circles.fullNextSoon}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* LIBRARY — only renders if there are any */}
        {libraryProducts.length > 0 && (
          <section className="circles" id="library">
            <div className="wrap narrow rv" style={{ textAlign: "center" }}>
              <span className="tag" style={{ display: "block" }}>
                {c.library.tag}
              </span>
              <h2>{c.library.title}</h2>
              <p className="p-lg">{c.library.body}</p>
            </div>
            <div className="wrap circles-grid">
              {libraryProducts.map((p) => {
                const price = new Intl.NumberFormat(c.circles.dateLocale, {
                  style: "currency",
                  currency: p.currency,
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                }).format(p.priceCents / 100);
                const minutes = p.videoDurationSeconds
                  ? Math.round(p.videoDurationSeconds / 60)
                  : null;
                return (
                  <div className="circle-card rv" key={p.id}>
                    <h3>{p.name}</h3>
                    <div className="meta">
                      {minutes !== null
                        ? `${minutes}${c.library.minShort}`
                        : c.library.video}
                    </div>
                    {p.description && <p className="desc">{p.description}</p>}
                    <div className="price">{price}</div>
                    <Link href={`/offerings/${p.id}`} className="cta">
                      {c.library.requestAccess}
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* CONTACT — the actual inquiry form */}
        <section className="contact" id="contact">
          <div className="wrap narrow rv" style={{ textAlign: "center" }}>
            <span className="tag" style={{ display: "block" }}>
              {c.contact.tag}
            </span>
            <h2>{c.contact.title}</h2>
            <p className="p-lg">{c.contact.body}</p>
          </div>
          <div className="form-shell rv">
            <LandingLeadForm
              availableWindows={availableWindows}
              copy={c.form}
            />
          </div>
        </section>

        {/* FINAL */}
        <section className="final">
          <div className="wrap narrow rv">
            <span className="tag">{c.final.tag}</span>
            <h2>{c.final.title}</h2>
            <p className="p-lg">{c.final.body}</p>
            <a href="#ways" className="btn btn-pri">
              {c.final.btn} <span className="ar">→</span>
            </a>
            <p className="tagline">{c.final.tagline}</p>
          </div>
        </section>

        <footer className="lfoot">
          <div className="brand">
            Svitlana
            <small
              style={{
                display: "block",
                fontSize: "10px",
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "var(--land-ink-soft)",
                fontWeight: 600,
                marginTop: "2px",
              }}
            >
              {c.footer.subtitle}
            </small>
          </div>
          <p>{c.footer.body}</p>
          <Link href="/signin" className="signin-link">
            {c.footer.signin}
          </Link>
        </footer>
      </div>
    </>
  );
}
