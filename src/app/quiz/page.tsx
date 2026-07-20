// Public "Find your compass" quiz — the storefront lead magnet. Shared from
// social; sorts a visitor toward one door (or gently out), then offers the
// workbook by email. No auth (see proxy.ts PUBLIC_PATHS).
//
// The quiz content itself is always-visible (no `.rv` reveal classes), so it
// can never render blank the way the scroll-reveal pages could.

import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { Quiz } from "@/components/Quiz";
import { resolveStorefrontAccountId } from "@/lib/storefront-account";
import { listUpcomingPublicGroupSessions } from "@/lib/group-actions";
import "../landing.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Which way is your compass pointing? — a 2-minute reflection",
  description:
    "You point the way for everyone. Take a quiet 2-minute reflection to hear where your own compass has been pointing.",
};

export default async function QuizPage() {
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
              A 2-minute reflection
            </span>
            <h2 style={{ marginBottom: 12 }}>
              Which way is your compass pointing?
            </h2>
            <p className="p-lg">
              You point the way for everyone. This is a quiet moment to check in
              with your own direction — no wrong answers, nothing to get right.
            </p>
          </div>

          <Quiz circleHref={circleHref} />
        </section>
      </main>
    </>
  );
}
