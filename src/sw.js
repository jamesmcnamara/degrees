/**
 * Offline app-shell service worker.
 *
 * On install it precaches the app shell ("/"), the static PWA files, and the
 * hashed JS/CSS bundles it discovers by parsing the served HTML. This means the
 * app boots fully offline after a single online visit, regardless of when the
 * worker takes control of the page.
 *
 * At runtime:
 *  - Navigations: network-first with a timeout, falling back to the cached shell
 *    ("/") so client-side routes work offline.
 *  - Other same-origin GETs: stale-while-revalidate (instant from cache, freshen
 *    in the background).
 *
 * Every network read is time-boxed. A dead-but-routable server (e.g. the LAN dev
 * machine is asleep) drops packets rather than refusing the connection, so
 * `fetch` hangs instead of rejecting; without a timeout the page would wait on
 * the network forever and never reach the cache fallback.
 */

const CACHE = "six-degrees-v3";
const NETWORK_TIMEOUT_MS = 5000;

/** Fetch that rejects once `ms` elapses, aborting the in-flight request. */
const fetchWithTimeout = (request, ms = NETWORK_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
};
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

/** Fetch a URL with a timeout and store it in the cache; never throws. */
const precache = async (cache, url, cacheMode) => {
  try {
    const res = await fetchWithTimeout(new Request(url, { cache: cacheMode }));
    if (res.ok) await cache.put(url, res.clone());
  } catch {
    /* best-effort */
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(STATIC.map((u) => precache(cache, u, "reload")));
      try {
        const res = await fetchWithTimeout(
          new Request("/", { cache: "reload" }),
        );
        await cache.put("/", res.clone());
        await Promise.all(
          assetUrlsFrom(await res.text()).map((url) =>
            precache(cache, url, "reload"),
          ),
        );
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
      await Promise.all(data.urls.map((u) => precache(cache, u, "no-cache")));
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
        const cache = await caches.open(CACHE);
        try {
          const response = await fetchWithTimeout(request);
          if (response.ok) cache.put("/", response.clone());
          return response;
        } catch {
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

      // Cached: serve instantly and refresh in the background. The revalidation
      // must not be awaited, or a hanging network would block the response.
      if (cached) {
        event.waitUntil(
          fetchWithTimeout(request)
            .then((response) => {
              if (response.ok) return cache.put(request, response.clone());
            })
            .catch(() => {}),
        );
        return cached;
      }

      try {
        const response = await fetchWithTimeout(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
