// Google Analytics (GA4) for the PUBLIC storefront only — landing, quiz,
// Circle sign-up and free-resource pages. Deliberately never in the root
// layout: the practice app and the client portal carry client names, notes
// and session details, and none of that should ever reach Google.
//
// Production only (VERCEL_ENV), so local dev and preview deploys don't
// pollute her numbers. GA4's enhanced measurement records page views on
// client-side navigation itself, so there's nothing to wire per route.
//
// To use it on another public page, render <GoogleAnalytics /> anywhere in
// that page. next/script dedupes by id, so it's safe on every page.

import Script from "next/script";

const GA_ID = "G-KLBBN93PVP";

export function GoogleAnalytics() {
  if (process.env.VERCEL_ENV !== "production") return null;
  return (
    <>
      <Script
        id="ga-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
