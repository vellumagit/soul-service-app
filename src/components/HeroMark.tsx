"use client";

import { useBrandLogo } from "./BrandProvider";

// The floating mark at the top of the landing hero.
//
// Uses her uploaded logo when she has one; otherwise falls back to the built-in
// compass (so an account with no logo set is unchanged). Reuses the `.compass`
// class either way, so the size (78px), centering and float animation are
// identical. A transparent-background logo reads best here — a logo baked onto
// a solid tile shows as a disc rather than a free-floating seal.
export function HeroMark() {
  const logoUrl = useBrandLogo();

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        className="compass"
        alt=""
        aria-hidden="true"
        style={{ objectFit: "contain", borderRadius: "50%" }}
      />
    );
  }

  return (
    <svg
      className="compass"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="46" stroke="#B05C36" strokeWidth="1.5" />
      <circle
        cx="50"
        cy="50"
        r="38"
        stroke="#C99A5B"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      <path d="M50 16 L57 50 L50 84 L43 50 Z" fill="#B05C36" opacity="0.9" />
      <path d="M50 16 L57 50 L50 50 Z" fill="#8F4727" />
      <circle cx="50" cy="50" r="4" fill="#2B2823" />
    </svg>
  );
}
