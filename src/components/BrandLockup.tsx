"use client";

// Her logo + the wordmark, side by side. One lockup, used in the landing nav,
// the landing footer and the workspace sidebar.
//
// WHY THE TEXT STAYS: the logo used to REPLACE "Svitlana / Soul Services"
// entirely. Her mark is a circular medallion with the name set in fine gold
// type around its rim — at nav size that rim text is unreadable, so replacing
// the wordmark with it meant her name effectively vanished from the top of her
// own site. The mark carries recognition; the words carry the name. Both.
//
// Sizing is passed in rather than fixed because a round medallion needs real
// room to read: small in the nav, larger in the footer where there's space.

import { useBrandLogo } from "./BrandProvider";

export function BrandLockup({
  subtitle,
  markSize = 40,
  className = "",
}: {
  /** "Soul Services", from the copy dictionary so it follows the language. */
  subtitle: string;
  /** Height AND width of the mark box, px. It's square — most marks are. */
  markSize?: number;
  className?: string;
}) {
  const logoUrl = useBrandLogo();

  return (
    <span className={`brand-lockup ${className}`.trim()}>
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          aria-hidden="true"
          className="brand-mark"
          style={{ height: markSize, width: markSize }}
          draggable={false}
        />
      )}
      <span className="brand-text">
        Svitlana
        <small>{subtitle}</small>
      </span>
    </span>
  );
}
