"use client";

// Adds the `.in` class to `.rv` elements as they scroll into view.
// Same IntersectionObserver pattern from the original HTML, just lifted
// into a tiny Client Component because Server Components can't carry
// inline scripts.

import { useEffect } from "react";

export function LandingReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>(".landing-root .rv");
    if (targets.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    targets.forEach((el, i) => {
      // Stagger first 3 in each row so they cascade in nicely.
      el.style.transitionDelay = `${Math.min(i % 3, 2) * 0.08}s`;
      io.observe(el);
    });

    return () => io.disconnect();
  }, []);

  return null;
}
