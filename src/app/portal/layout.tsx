// The portal lives in its own layout — no practitioner AppShell, no
// sidebar nav, no Help Buddy. Just the same Vesper palette and atmosphere
// so it feels continuous with Soul Service's brand, but framed as a
// distinct "your space" surface for the client.

import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { FlashNotifier } from "@/components/FlashNotifier";
import { PortalNav } from "@/components/PortalNav";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TimeOfDayProvider />
      <FlashNotifier />
      <div className="min-h-screen" style={{ background: "var(--color-app-bg)" }}>
        <PortalNav />
        {children}
      </div>
    </>
  );
}
