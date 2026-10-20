import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

const source = await Bun.file(new URL("./sw.js", import.meta.url)).text();

async function requestAsset(path: string, online: boolean, mode = "cors") {
  const origin = "https://phone.local:3001";
  const request = { url: origin + path, method: "GET", mode };
  const entries = new Map([
    [request.url, new Response("cached bundle")],
    ["/", new Response("cached shell")],
  ]);
  let handler: (event: unknown) => void = () => {
    throw new Error("Service worker did not register a fetch handler");
  };
  const cache = {
    match: async (key: string | { url: string }) =>
      entries.get(typeof key === "string" ? key : key.url)?.clone(),
    put: async (key: string | { url: string }, response: Response) => {
      entries.set(typeof key === "string" ? key : key.url, response);
    },
  };
  runInNewContext(source, {
    self: {
      location: { origin },
      addEventListener(type: string, listener: typeof handler) {
        if (type === "fetch") handler = listener;
      },
    },
    caches: { open: async () => cache },
    fetch: async () => {
      if (!online) throw new Error("Offline");
      return new Response("fresh bundle");
    },
    URL,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  let response: Promise<Response> | undefined;
  const pending: Promise<unknown>[] = [];
  handler({
    request,
    respondWith(value: Promise<Response>) {
      response = value;
    },
    waitUntil(value: Promise<unknown>) {
      pending.push(value);
    },
  });
  if (!response) throw new Error("Service worker did not handle request");
  const body = await (await response).text();
  await Promise.all(pending);
  return { body, cached: await entries.get(request.url)?.text() };
}

test("Bun development bundles use fresh content at the same URL", async () => {
  expect(await requestAsset("/_bun/client/index.js", true)).toEqual({
    body: "fresh bundle",
    cached: "fresh bundle",
  });
});

test("Bun development bundles fall back to cached assets, not HTML, offline", async () => {
  expect((await requestAsset("/_bun/client/index.js", false)).body).toBe(
    "cached bundle",
  );
});

test("production assets retain stale-while-revalidate caching", async () => {
  expect(await requestAsset("/index-hashed.js", true)).toEqual({
    body: "cached bundle",
    cached: "fresh bundle",
  });
});

test("offline navigation still falls back to the cached shell", async () => {
  expect((await requestAsset("/actor/new", false, "navigate")).body).toBe(
    "cached shell",
  );
});
