/**
 * Offline app-shell service worker.
 *
 * On install it precaches the app shell ("/"), the static PWA files, and the
 * hashed JS/CSS bundles it discovers by parsing the served HTML. This means the
 * app boots fully offline after a single online visit, regardless of when the
 * worker takes control of the page.
 *
 * At runtime:
 *  - Navigations: network-first, falling back to the cached shell ("/") so
 *    client-side routes work offline.
 *  - Other same-origin GETs: stale-while-revalidate (instant from cache, freshen
 *    in the background).
 */

const CACHE = "six-degrees-v3";
const STATIC = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

/** Find hashed asset URLs referenced in an HTML document. */
const assetUrlsFrom = (html) =>
  [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => /\.(?:js|css)(?:\?|$)/.test(u))
    .map((u) => new URL(u, self.location.origin).href);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        STATIC.map((u) =>
          cache.add(new Request(u, { cache: "reload" })).catch(() => {}),
        ),
      );
      try {
        const res = await fetch("/", { cache: "reload" });
        await cache.put("/", res.clone());
        for (const url of assetUrlsFrom(await res.text())) {
          await cache
            .add(new Request(url, { cache: "reload" }))
            .catch(() => {});
        }
      } catch {
        /* offline during install: runtime caching will fill in later */
      }
      await self.skipWaiting();
    })(),
  );
});

// Precache an explicit list of URLs the page sends after it has fully loaded.
// This captures the exact asset graph the app actually used (HTML, JS, CSS,
// fonts, icons) — including anything the install-time HTML parse couldn't see —
// so the next visit works fully offline even with no server.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache-urls" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        data.urls.map((u) =>
          cache.add(new Request(u, { cache: "no-cache" })).catch(() => {}),
        ),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put("/", response.clone());
          return response;
        } catch {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match("/")) ||
            (await cache.match(request)) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
