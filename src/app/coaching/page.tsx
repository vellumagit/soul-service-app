// Public offering page: /coaching (English) and /uk/coaching (Ukrainian — see
// proxy.ts). Words in src/lib/offering-pages.ts; prices are her live offers.

import { OfferingPage, offeringMetadata } from "@/components/OfferingPage";
import "../landing.css";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return offeringMetadata("coaching");
}

export default function Page() {
  return <OfferingPage slug="coaching" />;
}
