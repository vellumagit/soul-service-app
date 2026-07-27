"use client";

// The "Svitlana" wordmark in the landing nav doubles as a secret door to
// the workspace. To every visitor it's just the logo. But three quick taps
// (within ~1.2s) slip the practitioner into /signin — no visible "admin"
// link, no clutter on the storefront. On-brand with the app's whole
// "threshold / doorway" language: her site has a private entrance only she
// knows how to cross.
//
// Single tap does nothing visible (we're already on the landing page), so
// visitors never trigger it by accident.

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useBrandLogo } from "./BrandProvider";

const TAP_WINDOW_MS = 1200;
const TAPS_NEEDED = 3;

export function SecretSignInWordmark() {
  const router = useRouter();
  const taps = useRef<number[]>([]);
  // Her uploaded logo stands in for the text wordmark — and keeps the secret
  // door, since the taps live on the wrapper either way.
  const logoUrl = useBrandLogo();

  function handleTap() {
    const now = Date.now();
    // Keep only taps inside the rolling window, then add this one.
    taps.current = taps.current.filter((t) => now - t < TAP_WINDOW_MS);
    taps.current.push(now);
    if (taps.current.length >= TAPS_NEEDED) {
      taps.current = [];
      router.push("/signin");
    }
  }

  return (
    <div
      className="brand"
      onClick={handleTap}
      // Suppress text selection so the triple-tap registers as clicks
      // instead of selecting the wordmark text.
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="Svitlana"
          style={{
            maxHeight: 44,
            maxWidth: 200,
            objectFit: "contain",
            display: "block",
          }}
          draggable={false}
        />
      ) : (
        <>
          Svitlana
          <small>Soul Services</small>
        </>
      )}
    </div>
  );
}
