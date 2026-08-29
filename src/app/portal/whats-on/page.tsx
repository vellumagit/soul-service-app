// "What's on" — upcoming Circles this client could join.
//
// Her existing clients are the warmest audience she has for a Circle, and
// until now the portal told them nothing: Circles lived only on the public
// storefront, which a signed-in client has no reason to visit.
//
// Signing up still goes through the public /circles/[id] page — same form,
// same capacity checks, same Stripe path. This tab is discovery, not a second
// booking flow.

import Link from "next/link";
import { requirePortalSession } from "@/lib/portal-auth";
import { getOpenCircles } from "@/lib/portal-circles";
import { getPortalTimeZone } from "@/lib/portal-timezone";
import { fullDate, shortTime, zoneAbbrev, safeCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

function price(cents: number, currency: string): string {
  if (cents <= 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: safeCurrency(currency),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function PortalWhatsOnPage() {
  const portal = await requirePortalSession();
  const [circles, { timeZone, hasOwnZone }] = await Promise.all([
    getOpenCircles(portal.accountId, portal.clientId, portal.clientEmail),
    getPortalTimeZone(portal.accountId, portal.clientId),
  ]);

  const zone = zoneAbbrev(new Date(), timeZone);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <header className="mb-7">
        <h1
          className="text-2xl md:text-3xl text-ink-900 serif mb-1"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          What&apos;s on
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          Circles coming up that you&apos;re welcome to join.
          {zone && (
            <>
              {" "}
              All times {zone}
              {!hasOwnZone && " (practice time)"}.
            </>
          )}
        </p>
      </header>

      {circles.length === 0 ? (
        <div className="paper-card p-10 text-center">
          <p
            className="serif-italic text-base text-plum-700 mb-1"
            style={{ fontWeight: 400 }}
          >
            Nothing open at the moment.
          </p>
          <p className="text-sm text-ink-500 italic leading-relaxed">
            When a Circle opens up, it will appear here. Anything
            you&apos;ve already joined lives under{" "}
            <Link href="/portal/yours" className="text-plum-700 hover:underline">
              Yours
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {circles.map((c) => (
            <li key={c.groupSessionId} className="paper-card p-5 md:p-6">
              <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-1">
                Circle
                {c.language === "uk" && " · українською"}
              </p>
              <p
                className="text-lg text-ink-900 serif mb-1"
                style={{ fontWeight: 500, letterSpacing: "-0.01em" }}
              >
                {c.name}
              </p>
              <p className="text-sm text-ink-600 mb-2">
                {fullDate(c.scheduledAt, timeZone)} ·{" "}
                {shortTime(c.scheduledAt, timeZone)} · {c.durationMinutes} min
              </p>
              {c.description && (
                <p className="text-sm text-ink-700 leading-relaxed mb-3">
                  {c.description}
                </p>
              )}
              <div className="flex items-baseline gap-3 flex-wrap mb-3">
                <span className="text-sm font-mono text-ink-800">
                  {price(c.priceCents, c.currency)}
                </span>
                <span className="text-[12px] text-ink-500 italic">
                  {c.seatsLeft === 1
                    ? "1 seat left"
                    : `${c.seatsLeft} seats left`}
                </span>
              </div>
              <Link
                href={`/circles/${c.groupSessionId}`}
                className="inline-block px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
              >
                Take a seat →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
