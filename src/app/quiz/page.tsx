// Public "Find your compass" quiz — the storefront lead magnet. Shared from
// social; sorts a visitor toward one door (or gently out), then offers the
// workbook by email. No auth (see proxy.ts PUBLIC_PATHS).
//
// The quiz content itself is always-visible (no `.rv` reveal classes), so it
// can never render blank the way the scroll-reveal pages could.

import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { Quiz } from "@/components/Quiz";
import { resolveStorefrontAccountId } from "@/lib/storefront-account";
import { listUpcomingPublicGroupSessions } from "@/lib/group-actions";
import { getLandingLang } from "@/lib/landing-lang";
import { getLandingCopy } from "@/lib/landing-copy";
import { QUIZ_PAUSED } from "@/lib/quiz-status";
import "../landing.css";

export const dynamic = "force-dynamic";

// Bilingual: title + description follow the visitor's language cookie, so a
// Ukrainian visitor's browser tab and shared-link preview read in Ukrainian too.
export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLandingLang();
  // Paused: don't let a shared /quiz link preview as the live quiz — give it a
  // neutral title. Reverses when QUIZ_PAUSED flips back to false.
  if (QUIZ_PAUSED) {
    return { title: lang === "uk" ? "Невеличка пауза" : "A short pause" };
  }
  const c = getLandingCopy(lang);
  return {
    title: c.quiz.metaTitle,
    description: c.quiz.metaDescription,
  };
}

export default async function QuizPage() {
  const lang = await getLandingLang();
  const c = getLandingCopy(lang);

  // Paused (see quiz-status.ts): show a gentle bilingual note instead of the
  // quiz so direct links / shared posts land somewhere graceful. Temporary —
  // this whole branch comes out when QUIZ_PAUSED flips back to false.
  if (QUIZ_PAUSED) {
    const paused =
      lang === "uk"
        ? {
            title: "Ця рефлексія зараз на короткій паузі.",
            body: "Незабаром вона повернеться. А поки що — щиро запрошую завітати на головну сторінку.",
            back: "← На головну",
          }
        : {
            title: "This reflection is taking a short pause.",
            body: "It'll be back before long. In the meantime, you're warmly welcome to look around.",
            back: "← Back to the main page",
          };
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
          <section className="circles" style={{ padding: "64px 24px 96px" }}>
            <div className="wrap narrow" style={{ textAlign: "center" }}>
              <h2 style={{ marginBottom: 14 }}>{paused.title}</h2>
              <p className="p-lg" style={{ marginBottom: 28 }}>
                {paused.body}
              </p>
              <Link
                href="/"
                style={{
                  color: "var(--land-clay)",
                  textDecoration: "underline",
                  fontSize: 14,
                }}
              >
                {paused.back}
              </Link>
            </div>
          </section>
        </main>
      </>
    );
  }

  // Resolve the "keeper → Circle" door to the soonest bookable Circle when
  // sign-ups are open; otherwise fall back to the contact form.
  let circleHref = "/#contact";
  try {
    const accountId = await resolveStorefrontAccountId();
    if (accountId) {
      const [cfg] = await db
        .select({ circleSignupsOpen: practitionerSettings.circleSignupsOpen })
        .from(practitionerSettings)
        .where(eq(practitionerSettings.accountId, accountId))
        .limit(1);
      if (cfg?.circleSignupsOpen) {
        const circles = await listUpcomingPublicGroupSessions(1, accountId);
        if (circles[0]) circleHref = `/circles/${circles[0].sessionId}`;
      }
    }
  } catch (err) {
    console.warn("[quiz] circle href resolve failed:", err);
  }

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

        <section className="circles" style={{ padding: "44px 24px 90px" }}>
          <div
            className="wrap narrow"
            style={{ textAlign: "center", marginBottom: 34 }}
          >
            <span className="tag" style={{ display: "block" }}>
              {c.quiz.tag}
            </span>
            <h2 style={{ marginBottom: 12 }}>{c.quiz.heading}</h2>
            <p className="p-lg">{c.quiz.intro}</p>
          </div>

          <Quiz circleHref={circleHref} lang={lang} copy={c.quiz} />
        </section>
      </main>
    </>
  );
}
