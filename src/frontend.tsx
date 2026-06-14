/**
 * Entry point: mounts the React app and (in production) registers the service
 * worker so the app loads offline after the first visit.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Link the PWA manifest and icons (served by the Bun server, not bundled).
const head = (rel: string, href: string, extra: Record<string, string> = {}) => {
  if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  for (const [k, v] of Object.entries(extra)) link.setAttribute(k, v);
  document.head.appendChild(link);
};
head("manifest", "/manifest.json");
head("icon", "/icon.svg", { type: "image/svg+xml" });
head("apple-touch-icon", "/icon.svg");

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

if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is best-effort */
    });
  });
}
