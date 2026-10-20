import { isIP } from "node:net";

interface Connection {
  upstream: WebSocket | null;
  pending: (string | Uint8Array<ArrayBuffer>)[];
  target: string;
}

export function startDevProxy(
  upstream: URL,
  hostname: string,
  port: number,
  tls?: { cert: Bun.BunFile; key: Bun.BunFile },
) {
  return Bun.serve<Connection>({
    hostname: "0.0.0.0",
    port,
    tls,
    async fetch(request, server) {
      const url = new URL(request.url);
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (
        host.toLowerCase() !== hostname.toLowerCase() &&
        host !== "localhost" &&
        !isIP(host)
      ) {
        return new Response("Blocked: unconfigured development host", {
          status: 403,
        });
      }

      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) {
        return new Response("Blocked: cross-origin development request", {
          status: 403,
        });
      }

      const target = new URL(upstream);
      target.pathname = url.pathname;
      target.search = url.search;
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        target.protocol = "ws:";
        if (server.upgrade(request, {
          data: { upstream: null, pending: [], target: target.href },
        })) {
          return;
        }
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      const headers = new Headers(request.headers);
      headers.set("host", upstream.host);
      if (origin) headers.set("origin", upstream.origin);
      headers.delete("connection");
      headers.delete("transfer-encoding");
      try {
        return await fetch(target, {
          method: request.method,
          headers,
          body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
          redirect: "manual",
          decompress: false,
          signal: request.signal,
        });
      } catch (error) {
        console.error("Development proxy request failed:", error);
        return new Response("Development server unavailable", { status: 502 });
      }
    },
    websocket: {
      maxPayloadLength: 1024 * 1024,
      open(client) {
        const socket = new WebSocket(client.data.target);
        socket.binaryType = "arraybuffer";
        client.data.upstream = socket;
        socket.onopen = () => {
          client.data.pending.forEach((message) => socket.send(message));
          client.data.pending = [];
        };
        socket.onmessage = (event) => client.send(event.data);
        socket.onclose = () => client.close(1000, "Development connection closed");
        socket.onerror = (error) => {
          console.error("Development proxy WebSocket failed:", error);
          client.close(1011, "Development connection failed");
        };
      },
      message(client, message) {
        const data =
          typeof message === "string" ? message : new Uint8Array(message);
        if (client.data.upstream?.readyState === WebSocket.OPEN) {
          client.data.upstream.send(data);
        } else if (client.data.pending.length < 32) {
          client.data.pending.push(data);
        } else {
          client.close(1013, "Development connection not ready");
        }
      },
      close(client) {
        client.data.upstream?.close();
        client.data.pending = [];
      },
    },
  });
}
