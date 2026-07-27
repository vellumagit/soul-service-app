"use client";

// Her logo, provided once at the root so any client component can reach it
// without every page threading a prop. Seeded by the root layout from
// getBrand(); null means "no logo set" and every consumer falls back to the
// text wordmark the app has always used.

import { createContext, useContext } from "react";

const BrandLogoContext = createContext<string | null>(null);

export function BrandProvider({
  logoUrl,
  children,
}: {
  logoUrl: string | null;
  children: React.ReactNode;
}) {
  return (
    <BrandLogoContext.Provider value={logoUrl}>
      {children}
    </BrandLogoContext.Provider>
  );
}

/** Her uploaded logo URL, or null when she hasn't set one. */
export function useBrandLogo(): string | null {
  return useContext(BrandLogoContext);
}
