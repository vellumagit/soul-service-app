// Soul Service service worker — deliberately minimal.
//
// It exists so the home-screen install is a real app (and survives a dropped
// connection with a friendly page), NOT to cache the app. Everything on this
// origin is NETWORK-FIRST: the whole reason this file was written is that an
// installed shortcut had frozen on an old snapshot after deploys. Nothing
// here can pin an old page. Only immutable build assets (/_next/static/*,
// content-hashed) are kept for offline use; API calls are never touched.
//
// skipWaiting + clients.claim: a new worker takes over immediately, so there
// is never an old worker lingering behind a fresh deploy.

const CACHE = "soul-service-v1";

const OFFLINE_HTML =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Offline</title></head>" +
  '<body style="margin:0;background:#faf7f4;color:#3d342e;font-family:Georgia,serif;text-align:center;padding:5rem 1.5rem">' +
  '<h1 style="font-weight:400;font-size:1.4rem;margin:0 0 .5rem">You’re offline</h1>' +
  '<p style="color:#786b60;margin:0">Soul Service needs a connection. It’ll come back the moment you’re online.</p>' +
  "</body></html>";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isNavigation =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");
  const isBuildAsset = url.pathname.startsWith("/_next/static/");

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && isBuildAsset) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        if (isBuildAsset) {
          const cached = await caches.match(req);
          if (cached) return cached;
        }
        if (isNavigation) {
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        return Response.error();
      })
  );
});
