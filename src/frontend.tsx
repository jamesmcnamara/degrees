/**
 * Entry point: mounts the React app and (in production) registers the service
 * worker so the app loads offline after the first visit.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Link the PWA manifest and icons (served by the Bun server, not bundled).
const head = (
  rel: string,
  href: string,
  extra: Record<string, string> = {},
) => {
  if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  for (const [k, v] of Object.entries(extra)) link.setAttribute(k, v);
  document.head.appendChild(link);
};
head("manifest", "/manifest.json");
head("icon", "/icon.svg", { type: "image/svg+xml" });
head("apple-touch-icon", "/icon-192.png");

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  createRoot(elem).render(app);
}

// Register the service worker so the app loads offline after the first visit.
// Registered in every environment (dev included) so installing the PWA from a
// LAN dev server still works offline.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {
      return; // offline support is best-effort
    }

    // Once a service worker controls the page, hand it the list of same-origin
    // resources we just loaded so it can precache them. This guarantees the app
    // boots fully offline next time, even if the install-time HTML scan missed
    // an asset (e.g. dynamically loaded chunks, fonts, icons).
    const precacheLoaded = () => {
      const ctrl = navigator.serviceWorker.controller;
      if (!ctrl) return;
      const urls = [
        location.href,
        ...performance.getEntriesByType("resource").map((e) => e.name),
      ].filter((u) => new URL(u, location.origin).origin === location.origin);
      ctrl.postMessage({ type: "cache-urls", urls });
    };

    precacheLoaded();
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      precacheLoaded,
    );
  });
}
