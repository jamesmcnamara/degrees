import { serve } from "bun";
import { existsSync } from "node:fs";
import index from "./index.html";
import manifest from "./manifest.json";
import { startDevProxy } from "./lib/devProxy";

const asset = (name: string, type: string) =>
  new Response(Bun.file(new URL(`./${name}`, import.meta.url)), {
    headers: { "Content-Type": type },
  });

// Serve over HTTPS when certs/cert.pem + certs/key.pem exist (run
// `bun run cert` to generate them). HTTPS is required for the PWA service
// worker to work on devices other than localhost (e.g. your phone over LAN).
const certPath = new URL("../certs/cert.pem", import.meta.url);
const keyPath = new URL("../certs/key.pem", import.meta.url);
const hasCerts = existsSync(certPath) && existsSync(keyPath);
const devHost = process.env.DEV_HOST;
const proxyDevelopment = process.env.NODE_ENV !== "production" && !!devHost;
const tls = hasCerts
  ? { cert: Bun.file(certPath), key: Bun.file(keyPath) }
  : undefined;

const appServer = serve({
  hostname: proxyDevelopment ? "127.0.0.1" : "0.0.0.0",
  port: proxyDevelopment ? 0 : 3001,
  tls: proxyDevelopment ? undefined : tls,
  routes: {
    // Service worker must be served from the root scope.
    "/sw.js": () => asset("sw.js", "text/javascript"),
    "/manifest.json": () => Response.json(manifest),
    "/icon.svg": () => asset("icon.svg", "image/svg+xml"),
    "/icon-192.png": () => asset("icon-192.png", "image/png"),
    "/icon-512.png": () => asset("icon-512.png", "image/png"),

    // SPA: serve index.html for everything else.
    "/*": index,

    // Placeholder for a future remote autocomplete source (see suggestions.ts).
    // "/api/suggest/:kind": async (req) => Response.json([]),
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

const server = proxyDevelopment && devHost
  ? startDevProxy(appServer.url, devHost, 3001, tls)
  : appServer;
const scheme = hasCerts ? "https" : "http";
const address = proxyDevelopment
  ? `${scheme}://${devHost}:${server.port}/`
  : server.url.href;
console.log(`🚀 Server running at ${address}`);
console.log(`   On your network: ${scheme}://<this-machine-ip>:${server.port}`);
if (!hasCerts) {
  console.log(
    "   ⚠️  HTTP only — run `bun run cert` for HTTPS (needed for PWA on your phone)",
  );
}
