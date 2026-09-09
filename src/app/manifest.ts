import type { MetadataRoute } from "next";

// Web app manifest — what makes "Add to Home Screen" a real installed app
// (its own window, its own icon) instead of a browser shortcut. Next serves
// this at /manifest.webmanifest and links it from every page. Must stay a
// PUBLIC path in proxy.ts, or the install fetch gets redirected to /signin.
//
// Updates are NOT handled here: the service worker is network-first (never
// serves a stale page) and UpdateBeacon reloads a resumed app that is behind
// the running deploy. See those files.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Soul Service",
    short_name: "Soul Service",
    description:
      "A quiet, personal client workspace for one-on-one practitioners.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7f4",
    theme_color: "#5a3f4f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
