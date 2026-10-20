import { afterEach, expect, test } from "bun:test";
import { startDevProxy } from "./devProxy";

const stopServers: (() => void)[] = [];
afterEach(() => {
  stopServers.forEach((stop) => stop());
  stopServers.length = 0;
});

function setup() {
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (new URL(request.url).pathname === "/socket") {
        if (server.upgrade(request)) return;
        return new Response("Upgrade failed", { status: 400 });
      }
      return Response.json({
        url: request.url,
        host: request.headers.get("host"),
        origin: request.headers.get("origin"),
        method: request.method,
      });
    },
    websocket: {
      message(socket, message) {
        socket.send(message);
      },
    },
  });
  const proxy = startDevProxy(upstream.url, "phone.local", 0);
  stopServers.push(() => {
    proxy.stop(true);
    upstream.stop(true);
  });
  return { upstream, proxy, url: `http://127.0.0.1:${proxy.port}` };
}

test("dev proxy listens on LAN and forwards the configured hostname to loopback", async () => {
  const { upstream, proxy, url } = setup();
  expect(proxy.hostname).toBe("0.0.0.0");
  const response = await fetch(`${url}/actor/new?scrollDebug=1`, {
    headers: { host: `phone.local:${proxy.port}` },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    url: `${upstream.url.origin}/actor/new?scrollDebug=1`,
    host: upstream.url.host,
    origin: null,
    method: "GET",
  });
});

test("dev proxy rejects unknown hosts and cross-origin requests", async () => {
  const { upstream, proxy, url } = setup();
  expect(
    (await fetch(url, { headers: { host: "untrusted.example" } })).status,
  ).toBe(403);
  expect(
    (await fetch(url, { headers: { origin: "https://untrusted.example" } })).status,
  ).toBe(403);
  const response = await fetch(url, {
    method: "POST",
    body: "test",
    headers: {
      host: `phone.local:${proxy.port}`,
      origin: `http://phone.local:${proxy.port}`,
    },
  });
  expect(response.status).toBe(200);
  expect((await response.json()).origin).toBe(upstream.url.origin);
});

test("dev proxy keeps double-slash paths on the fixed upstream", async () => {
  const { upstream, url } = setup();
  const response = await fetch(`${url}//untrusted.example/path`);
  const forwarded = new URL((await response.json()).url);
  expect(forwarded.origin).toBe(upstream.url.origin);
  expect(forwarded.pathname).toBe("/untrusted.example/path");
});

test("dev proxy forwards WebSocket messages in both directions", async () => {
  const { url } = setup();
  const socket = new WebSocket(`${url.replace("http:", "ws:")}/socket`);
  try {
    const result = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket timed out")), 3000);
      socket.onopen = () => socket.send("hot update");
      socket.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data);
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WebSocket failed"));
      };
    });
    expect(result).toBe("hot update");
  } finally {
    socket.close();
  }
});
