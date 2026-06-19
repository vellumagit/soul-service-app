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
// Same Vesper palette + time-of-day atmosphere so it feels like the
// same world the app inhabits.

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { LandingLeadForm } from "@/components/LandingLeadForm";
import { getSessionEmail } from "@/lib/session-cookies";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";

export const dynamic = "force-dynamic";

// Fallback copy when the practitioner hasn't filled in their landing
// fields yet. Soft, generic, soul-work-shaped — presentable on day one,
// replaceable as soon as she writes her own.
const DEFAULTS = {
  tagline:
    "One-on-one soul work, held with care. Sessions over video or in person.",
  about:
    "I work with people moving through tender stretches — grief, transitions, the kind of questions that don't have quick answers. Sessions are slow, attentive, and built around what you bring.",
  howItWorks:
    "We meet for an hour at a time. You bring whatever is alive for you. I hold the shape of the conversation and make space for what wants to surface. Between sessions you have a small private space to write — your reflections come with you into the next hour.",
  whatToExpect:
    "Not a quick fix. Not a prescription. A steady relationship over time — sometimes weekly, sometimes less often. We figure out together what your rhythm is.",
};

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;

  // If signed in as practitioner (and not previewing), send to workspace.
  const sessionEmail = await getSessionEmail();
  if (sessionEmail && preview !== "1") {
    redirect("/today");
  }
  // If signed in as a portal client, send to their space.
  const cookieStore = await cookies();
  if (cookieStore.get("sps_client")?.value && preview !== "1") {
    redirect("/portal");
  }

  // Pull the practitioner's settings — there's only one per deployment
  // in practice. Falls back to DEFAULTS for any unset field so the page
  // is presentable from day one.
  const settingsRows = await db
    .select({
      businessName: practitionerSettings.businessName,
      practitionerName: practitionerSettings.practitionerName,
      businessEmail: practitionerSettings.businessEmail,
      businessPhone: practitionerSettings.businessPhone,
      websiteUrl: practitionerSettings.websiteUrl,
      tagline: practitionerSettings.landingTagline,
      about: practitionerSettings.landingAbout,
      howItWorks: practitionerSettings.landingHowItWorks,
      whatToExpect: practitionerSettings.landingWhatToExpect,
    })
    .from(practitionerSettings)
    .limit(1);
  const s = settingsRows[0] ?? {
    businessName: null,
    practitionerName: null,
    businessEmail: null,
    businessPhone: null,
    websiteUrl: null,
    tagline: null,
    about: null,
    howItWorks: null,
    whatToExpect: null,
  };

  const heading = s.practitionerName ?? s.businessName ?? "Soul Service";
  const tagline = s.tagline?.trim() || DEFAULTS.tagline;
  const about = s.about?.trim() || DEFAULTS.about;
  const howItWorks = s.howItWorks?.trim() || DEFAULTS.howItWorks;
  const whatToExpect = s.whatToExpect?.trim() || DEFAULTS.whatToExpect;

  return (
    <>
      <TimeOfDayProvider />
      <div
        className="min-h-screen"
        style={{ background: "var(--color-app-bg)" }}
      >
        <main className="max-w-2xl mx-auto px-4 md:px-6 py-12 md:py-20">
          {/* Hero */}
          <header className="mb-12 md:mb-16">
            <h1
              className="text-4xl md:text-5xl text-ink-900 serif mb-3"
              style={{ fontWeight: 500, letterSpacing: "-0.02em" }}
            >
              {heading}
            </h1>
            <p
              className="serif-italic text-lg md:text-xl text-ink-700 leading-relaxed"
              style={{ fontWeight: 400 }}
            >
              {tagline}
            </p>
          </header>

          <div className="space-y-10 md:space-y-14">
            {/* About */}
            <section>
              <h2 className="text-[11px] uppercase tracking-widest text-plum-700 font-mono mb-3">
                About
              </h2>
              <p
                className="text-base text-ink-800 leading-relaxed whitespace-pre-wrap"
              >
                {about}
              </p>
            </section>

            {/* How it works */}
            <section>
              <h2 className="text-[11px] uppercase tracking-widest text-plum-700 font-mono mb-3">
                How I work
              </h2>
              <p className="text-base text-ink-800 leading-relaxed whitespace-pre-wrap">
                {howItWorks}
              </p>
            </section>

            {/* What to expect */}
            <section>
              <h2 className="text-[11px] uppercase tracking-widest text-plum-700 font-mono mb-3">
                What to expect
              </h2>
              <p className="text-base text-ink-800 leading-relaxed whitespace-pre-wrap">
                {whatToExpect}
              </p>
            </section>

            {/* Reach out */}
            <section className="paper-card paper-card--feature p-6 md:p-8">
              <h2
                className="serif-italic text-2xl text-plum-700 mb-2"
                style={{ fontWeight: 400 }}
              >
                Reach out
              </h2>
              <p className="text-sm text-ink-600 mb-6 leading-relaxed">
                Send a few sentences — what&apos;s on your mind, what
                you&apos;re curious about, or just say hello.
              </p>
              <LandingLeadForm />
            </section>

            {/* Quiet contact card under the lead form */}
            {(s.businessEmail || s.businessPhone) && (
              <section>
                <h2 className="text-[11px] uppercase tracking-widest text-plum-700 font-mono mb-3">
                  Or get in touch directly
                </h2>
                <div className="space-y-1.5 text-sm">
                  {s.businessEmail && (
                    <div>
                      <span className="text-ink-500 text-[11px] uppercase tracking-wider font-mono mr-2">
                        email
                      </span>
                      <a
                        href={`mailto:${s.businessEmail}`}
                        className="text-plum-700 hover:underline"
                      >
                        {s.businessEmail}
                      </a>
                    </div>
                  )}
                  {s.businessPhone && (
                    <div>
                      <span className="text-ink-500 text-[11px] uppercase tracking-wider font-mono mr-2">
                        phone
                      </span>
                      <a
                        href={`tel:${s.businessPhone}`}
                        className="text-plum-700 hover:underline"
                      >
                        {s.businessPhone}
                      </a>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Footer — quiet links for existing clients + practitioner */}
          <footer className="mt-16 md:mt-20 pt-6 border-t border-ink-100 flex items-center justify-between gap-3 flex-wrap text-[11px]">
            <Link
              href="/portal/sign-in"
              className="text-ink-500 hover:text-plum-700 hover:underline"
            >
              Already a client? Open your space →
            </Link>
            <Link
              href="/signin"
              className="text-ink-400 hover:text-ink-700 hover:underline"
            >
              Practitioner sign in
            </Link>
          </footer>
        </main>
      </div>
    </>
  );
}
