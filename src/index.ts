import { serve } from "bun";
import index from "./index.html";
import sw from "./sw.js" with { type: "text" };
import manifest from "./manifest.json";
import icon from "./icon.svg" with { type: "text" };

const file = (body: string, type: string) =>
  new Response(body, { headers: { "Content-Type": type } });

const server = serve({
  routes: {
    // Service worker must be served from the root scope.
    "/sw.js": () => file(sw, "text/javascript"),
    "/manifest.json": () => Response.json(manifest),
    "/icon.svg": () => file(icon, "image/svg+xml"),

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

console.log(`🚀 Server running at ${server.url}`);
