// Public offering page: /private-sessions (English) and /uk/private-sessions (Ukrainian — see
// proxy.ts). Words in src/lib/offering-pages.ts; prices are her live offers.

import { OfferingPage, offeringMetadata } from "@/components/OfferingPage";
import "../landing.css";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return offeringMetadata("private-sessions");
}

export default function Page() {
  return <OfferingPage slug="private-sessions" />;
}
