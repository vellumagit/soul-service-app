// Public landing page. The svit.live root URL.
//
// Routing:
//   - signed-in practitioner → redirect to /today (the workspace)
//   - signed-in portal client → redirect to /portal (their space)
//   - everyone else → render the landing page itself
//
// `?preview=1` escapes the practitioner redirect so Svit/Brian can
// preview their own landing without signing out.
//
// No AppShell, no Help Buddy, no sidebar — this is its own surface.
// Styled via /src/app/landing.css (scoped behind .landing-root).
// Time-of-day atmosphere stays so the page feels like part of the
// same world the app inhabits.

import Link from "next/link";
import { eq } from "drizzle-orm";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import {
  LandingLeadForm,
  type LandingWindow,
} from "@/components/LandingLeadForm";
import { LandingReveal } from "@/components/LandingReveal";
import { SecretSignInWordmark } from "@/components/SecretSignInWordmark";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";
import { getAvailableWindows } from "@/lib/availability";
import { listUpcomingPublicGroupSessions } from "@/lib/group-actions";
import { listPublishedProducts } from "@/lib/product-actions";
import "./landing.css";

function formatLandingWindowLabel(d: Date): string {
  return d.toLocaleString(undefined, {
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
  // theirs the same way (→ /portal). Keeping `/` unconditional is what
  // makes svit.live land on the storefront every single time, with no
  // dependence on hostname env vars.

  // Pull next available windows for the inquiry form — but ONLY when the
  // practitioner has opted in. Off by default; she flips
  // `showAvailabilityPublicly` in /settings → Availability. Without the
  // toggle on, the form behaves exactly like before (free-text only,
  // no windows shown).
  let availableWindows: LandingWindow[] = [];
  try {
    const settingsRow = await db
      .select({
        accountId: practitionerSettings.accountId,
        showAvailability: practitionerSettings.showAvailabilityPublicly,
      })
      .from(practitionerSettings)
      .limit(1);
    const cfg = settingsRow[0];
    if (cfg?.showAvailability) {
      const windows = await getAvailableWindows(cfg.accountId, { limit: 6 });
      availableWindows = windows.map((w) => ({
        startAt: w.startAt.toISOString(),
        endAt: w.endAt.toISOString(),
        label: formatLandingWindowLabel(w.startAt),
      }));
    }
  } catch (err) {
    // Availability is a "nice-to-have" enhancement to the inquiry form;
    // if Google FreeBusy or anything else blows up, just fall back to
    // the free-text form. NEVER let availability failures break the
    // public storefront.
    console.warn("[landing] availability fetch failed:", err);
  }

  // Upcoming public group sessions (Circles). Empty array if none — the
  // section simply doesn't render. Wrapped in try/catch for the same
  // reason as availability above.
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
              <Link href="/signin" className="nav-signin">
                Sign in
              </Link>
              <a href="#ways" className="navcta">
                Work with me
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
            <p className="eyebrow">
              For the parents and business owners who carry everyone but themselves
            </p>
            <h1>
              You point the way for everyone. Let&apos;s find <em>your</em>{" "}
              compass again.
            </h1>
            <p className="sub">
              Gentle guidance for the ones who hold it all together — to hear
              what&apos;s true for you, your family, and your work. Empowered by
              empathy, guided home to your own knowing.
            </p>
            <div className="btns">
              <a href="#ways" className="btn btn-pri">
                Find your way in <span className="ar">→</span>
              </a>
              <a href="#contact" className="btn btn-ghost">
                Send a note first
              </a>
            </div>
          </div>
        </header>

        {/* THE ACHE */}
        <section className="ache">
          <div className="wrap narrow rv">
            <span className="tag">Does this feel familiar?</span>
            <h2>
              You make a hundred decisions a day — and somewhere in the giving,
              your <em>own voice</em> got quiet.
            </h2>
            <p className="p-lg">
              For your children. Your partner. Your team. Your home. You&apos;ve
              become so good at knowing what everyone else needs that you&apos;ve
              half-forgotten how to ask what <em>you</em> need — or whether
              you&apos;d even trust the answer.
            </p>
          </div>
          <div className="wrap feelings">
            <div className="feel rv">
              <p>&ldquo;I&apos;m the one everyone leans on — and I&apos;m running on empty.&rdquo;</p>
            </div>
            <div className="feel rv">
              <p>&ldquo;There&apos;s a knowing inside me. I just can&apos;t hear it over the noise.&rdquo;</p>
            </div>
            <div className="feel rv">
              <p>&ldquo;I&apos;ve put myself last so long, I&apos;m not sure who I am anymore.&rdquo;</p>
            </div>
          </div>
        </section>

        {/* REFRAME */}
        <section>
          <div className="wrap narrow">
            <div className="rv" style={{ textAlign: "center" }}>
              <span className="tag">There&apos;s nothing wrong with you</span>
            </div>
            <p className="pull rv">
              Your compass isn&apos;t broken. It&apos;s just been{" "}
              <em>drowned out.</em>
            </p>
            <p
              className="p rv"
              style={{
                textAlign: "center",
                maxWidth: "38em",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              My work is simple. I help you get quiet enough to hear your own
              knowing again — and gentle enough with yourself to finally trust
              it. I don&apos;t hand you answers. You already have them. I help
              you remember what you already know.
            </p>
            <p className="signature rv">
              &ldquo;I feel <em>with</em> you. That&apos;s what makes it safe to
              feel yourself again.&rdquo;
            </p>
          </div>
        </section>

        {/* ABOUT */}
        <section className="about">
          <div className="wrap about-grid">
            <div className="portrait rv">
              <span>A warm photo of Svitlana goes here</span>
            </div>
            <div className="rv">
              <span className="tag">Who I am</span>
              <h2>I had to find my own way home first.</h2>
              <p className="p">
                Fifteen years ago I came to Canada carrying anxiety I
                couldn&apos;t name and a knowing I didn&apos;t yet trust. I
                spent years searching outside myself for answers — until I
                learned the answers were already in me, waiting to be heard.
              </p>
              <p className="p">
                Now I help parents and business owners do what I once had to:
                come home to themselves. People have called me{" "}
                <strong>a messenger of the truth</strong> — not because I have
                your answers, but because I help you hear your own. My work is
                gentle. I listen, I slow you down, I help you ground, and I
                guide you through your own filters until your voice comes
                through clear. Never judgmental. Always beside you.
              </p>
            </div>
          </div>
        </section>

        {/* WAYS TO WORK */}
        <section className="ways" id="ways">
          <div className="wrap narrow rv">
            <span className="tag" style={{ display: "block" }}>
              Ways to work together
            </span>
            <h2>
              Begin gently. Go as deep as you&apos;re <em>ready</em> for.
            </h2>
            <p className="p-lg">
              Every step is a small, comfortable yes. Start with a free
              reflection or a single evening in the Circle — and walk further
              when it feels right.
            </p>
          </div>

          <div className="wrap ladder">
            {/* entry lane */}
            <div className="lane">
              <div className="card free coming-soon rv">
                <span className="step">Start free</span>
                <h3>The Quiz &amp; Workbook</h3>
                <div className="price">Free</div>
                <p className="desc">
                  A quiet reflection to find which way your inner compass is
                  pointing — with a guided workbook to begin coming home to
                  yourself.
                </p>
                <span className="cta cta-soon" aria-disabled="true">
                  Coming soon
                </span>
              </div>
              <div className="card rv">
                <span className="step">Weekly · in a circle of women</span>
                <h3>The Circle</h3>
                <div className="price">
                  $20 <small>/ session</small>
                </div>
                <p className="desc">
                  A guided weekly group for women carrying a lot — one theme
                  each week, gently held by Svitlana. Slow down, feel held, and
                  remember you&apos;re not alone. 10–20 of you, ~2 hours,
                  online.
                </p>
                <a href="#contact" className="cta">
                  Join this week&apos;s Circle →
                </a>
              </div>
              <div className="card rv">
                <span className="step">One-to-one · your first yes</span>
                <h3>A Single Session</h3>
                <div className="price">$150</div>
                <p className="desc">
                  One conversation, just for you — in person, online, or
                  distance. A space to be witnessed, find clarity, and hear what
                  your compass has been trying to tell you.
                </p>
                <a href="#contact" className="cta">
                  Book a session →
                </a>
              </div>
            </div>

            {/* deep lane */}
            <div className="lane">
              <div className="card rv">
                <span className="step">Go deeper · the ongoing relationship</span>
                <h3>Monthly Retainer</h3>
                <div className="price">
                  $1,000 <small>/ month</small>
                </div>
                <p className="desc">
                  A weekly private session, plus message support between
                  sessions (voice or text — I reply within a day). You&apos;re
                  no longer alone with your decisions. I become your
                  compass-check.
                </p>
                <a href="#contact" className="cta">
                  Begin together →
                </a>
              </div>
              <div className="card feat rv">
                <span className="step">★ The real journey home</span>
                <h3>The 3-Month Journey</h3>
                <div className="price">
                  $2,700 <small>/ 3 months</small>
                </div>
                <p className="desc">
                  Everything in the retainer, committed for depth — because real
                  change unfolds over months, not moments. The most-loved way to
                  work with me, at the best rate.
                </p>
                <a href="#contact" className="cta">
                  Start the journey →
                </a>
              </div>
              <div className="card rv">
                <span className="step">Not sure where to start?</span>
                <h3>Let&apos;s talk first</h3>
                <div className="price">
                  Free <small>/ a real conversation</small>
                </div>
                <p className="desc">
                  A short, no-pressure call to feel into what&apos;s right for
                  you. No pitch — just a chance to be heard and to see if
                  we&apos;re a fit.
                </p>
                <a href="#contact" className="cta">
                  Reach out →
                </a>
              </div>
            </div>
            <p className="ladder-note">
              A monthly Circle pass and payment plans for the journey can be
              arranged — just ask.
            </p>
          </div>
        </section>

        {/* VOICES */}
        <section className="voices">
          <div
            className="wrap narrow rv"
            style={{ textAlign: "center" }}
          >
            <span className="tag" style={{ display: "block" }}>
              In their own words
            </span>
            <h2>
              What people feel after our time <em>together</em>.
            </h2>
          </div>
          <div className="wrap vgrid">
            <div className="voice rv">
              <p>&ldquo;I knew it was it — and now you said it.&rdquo;</p>
              <div className="who">— in her own words</div>
            </div>
            <div className="voice rv">
              <p>&ldquo;You said what was truth for me.&rdquo;</p>
              <div className="who">— in her own words</div>
            </div>
            <div className="voice rv">
              <p>
                &ldquo;I felt lighter, moved, touched — more connected to myself
                than I&apos;ve been in years.&rdquo;
              </p>
              <div className="who">— someone Svitlana worked with</div>
            </div>
            <div className="voice rv">
              <p>
                &ldquo;I came in feeling like a burden. I left with a smile,
                lighter — I&apos;d heard the truth.&rdquo;
              </p>
              <div className="who">— someone Svitlana worked with</div>
            </div>
          </div>
        </section>

        {/* UPCOMING CIRCLES — public group sessions, only renders if there are any */}
        {upcomingCircles.length > 0 && (
          <section className="circles" id="circles">
            <div
              className="wrap narrow rv"
              style={{ textAlign: "center" }}
            >
              <span className="tag" style={{ display: "block" }}>
                Coming up
              </span>
              <h2>
                Upcoming <em>Circles</em>.
              </h2>
              <p className="p-lg">
                Small group gatherings, by warm invitation. Hold a seat and
                I&apos;ll be in touch with everything you need.
              </p>
            </div>
            <div className="wrap circles-grid">
              {upcomingCircles.map((c) => {
                const spotsLeft = Math.max(0, c.capacity - c.spotsTaken);
                const when = c.scheduledAt.toLocaleString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                });
                return (
                  <div className="circle-card rv" key={c.sessionId}>
                    <h3>{c.groupName}</h3>
                    <div className="when">{when}</div>
                    <div className="meta">
                      {c.durationMinutes}min
                      <span className="dot" aria-hidden>
                        ·
                      </span>
                      {spotsLeft > 0
                        ? `${spotsLeft} seat${spotsLeft === 1 ? "" : "s"} left`
                        : "full"}
                      {c.topic && (
                        <>
                          <span className="dot" aria-hidden>
                            ·
                          </span>
                          <em>{c.topic}</em>
                        </>
                      )}
                    </div>
                    {c.groupDescription && (
                      <p className="desc">{c.groupDescription}</p>
                    )}
                    <div className="price">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: c.currency,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      }).format(c.priceCents / 100)}
                    </div>
                    {spotsLeft > 0 ? (
                      <Link
                        href={`/circles/${c.sessionId}`}
                        className="cta"
                      >
                        Hold a seat →
                      </Link>
                    ) : (
                      <span className="cta cta-full">
                        Full · next one soon
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* LIBRARY — recorded video offerings, only renders if there are any */}
        {libraryProducts.length > 0 && (
          <section className="circles" id="library">
            <div
              className="wrap narrow rv"
              style={{ textAlign: "center" }}
            >
              <span className="tag" style={{ display: "block" }}>
                On demand
              </span>
              <h2>
                The <em>Library</em>.
              </h2>
              <p className="p-lg">
                Recorded workshops and replays to revisit on your own time.
                Request access, settle up, and your private link arrives by
                email.
              </p>
            </div>
            <div className="wrap circles-grid">
              {libraryProducts.map((p) => {
                const price = new Intl.NumberFormat("en-US", {
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
                      {minutes !== null ? `${minutes}min` : "video"}
                      <span className="dot" aria-hidden>
                        ·
                      </span>
                      on demand
                    </div>
                    {p.description && <p className="desc">{p.description}</p>}
                    <div className="price">{price}</div>
                    <Link href={`/offerings/${p.id}`} className="cta">
                      Request access →
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
              Send a note
            </span>
            <h2>
              Curious? Curious. Reach <em>out</em>.
            </h2>
            <p className="p-lg">
              A few words is enough. I read every note myself and reply within a
              few days, usually sooner.
            </p>
          </div>
          <div className="form-shell rv">
            <LandingLeadForm availableWindows={availableWindows} />
          </div>
        </section>

        {/* FINAL */}
        <section className="final">
          <div className="wrap narrow rv">
            <span className="tag">It&apos;s your turn now</span>
            <h2>
              You&apos;ve spent so long caring for everyone else.{" "}
              <em>Give yourself</em> this.
            </h2>
            <p className="p-lg">
              Your inner compass is still there, waiting. Let&apos;s find it
              together — gently, at your pace, with someone beside you the whole
              way.
            </p>
            <a href="#ways" className="btn btn-pri">
              Find your way in <span className="ar">→</span>
            </a>
            <p className="tagline">Give yourself love.</p>
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
              Soul Services
            </small>
          </div>
          <p>
            Gentle guidance for parents and business owners coming home to
            themselves.
          </p>
          <Link href="/signin" className="signin-link">
            Already working with me? Sign in →
          </Link>
        </footer>
      </div>
    </>
  );
}
