import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  latestBackupFile,
  loadSettings,
  monthKey,
  restoreLatestBackup,
  runBackup,
  saveSettings,
} from "./backup";
import { GRAPH_STORAGE_KEY } from "./constants";

/** A minimal in-memory localStorage stand-in for tests. */
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  ).then((res) => {
    Object.defineProperty(res, "ok", { value: ok });
    return res;
  });

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).navigator = { onLine: true };
  saveSettings({ token: "tok", gistId: "gist123" });
});

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe("monthKey", () => {
  test("formats YYYY-MM with zero-padded month", () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01");
    expect(monthKey(new Date(2026, 10, 1))).toBe("2026-11");
  });
});

describe("latestBackupFile", () => {
  test("picks the lexicographically latest month", () => {
    const files = {
      "backup-2026-07.json": { filename: "backup-2026-07.json", content: "a" },
      "backup-2026-08.json": { filename: "backup-2026-08.json", content: "b" },
      "notes.txt": { filename: "notes.txt", content: "ignore me" },
    };
    expect(latestBackupFile(files)).toEqual({
      key: "2026-08",
      filename: "backup-2026-08.json",
      content: "b",
    });
  });

  test("returns null when there are no backup files", () => {
    expect(latestBackupFile({})).toBeNull();
  });
});

describe("runBackup", () => {
  test("skips when not configured", async () => {
    saveSettings({ token: "", gistId: "" });
    const result = await runBackup();
    expect(result.status).toBe("skipped-no-config");
  });

  test("skips when offline", async () => {
    (globalThis as any).navigator.onLine = false;
    localStorage.setItem(GRAPH_STORAGE_KEY, '{"movies":{}}');
    const result = await runBackup();
    expect(result.status).toBe("skipped-offline");
  });

  test("skips writing when content matches the latest backup file", async () => {
    const content = '{"movies":{"m1":{}}}';
    localStorage.setItem(GRAPH_STORAGE_KEY, content);
    const fetchMock = mock((_url: string, init?: RequestInit) => {
      expect(init?.method ?? "GET").toBe("GET");
      return jsonResponse({
        id: "gist123",
        files: {
          "backup-2026-08.json": {
            filename: "backup-2026-08.json",
            content,
          },
        },
      });
    });
    (globalThis as any).fetch = fetchMock;

    const result = await runBackup();
    expect(result.status).toBe("skipped-unchanged");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("updates the current month's file in place when content changed", async () => {
    const oldContent = '{"movies":{}}';
    const newContent = '{"movies":{"m1":{}}}';
    localStorage.setItem(GRAPH_STORAGE_KEY, newContent);

    const now = new Date();
    const currentMonthFile = `backup-${monthKey(now)}.json`;

    const calls: { url: string; init?: RequestInit }[] = [];
    (globalThis as any).fetch = mock((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (!init || init.method === undefined) {
        return jsonResponse({
          id: "gist123",
          files: {
            [currentMonthFile]: {
              filename: currentMonthFile,
              content: oldContent,
            },
          },
        });
      }
      // PATCH update
      return jsonResponse({ id: "gist123", files: {} });
    });

    const result = await runBackup();
    expect(result.status).toBe("backed-up");
    const patchCall = calls.find((c) => c.init?.method === "PATCH");
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall!.init!.body as string);
    expect(Object.keys(body.files)).toEqual([currentMonthFile]);
    expect(body.files[currentMonthFile].content).toBe(newContent);
  });

  test("starts a new month's file when the latest backup is from a prior month", async () => {
    const oldContent = '{"movies":{}}';
    const newContent = '{"movies":{"m1":{}}}';
    localStorage.setItem(GRAPH_STORAGE_KEY, newContent);

    const currentMonthFile = `backup-${monthKey(new Date())}.json`;
    const priorMonthFile = "backup-2000-01.json"; // definitely in the past

    const calls: { url: string; init?: RequestInit }[] = [];
    (globalThis as any).fetch = mock((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (!init || init.method === undefined) {
        return jsonResponse({
          id: "gist123",
          files: {
            [priorMonthFile]: { filename: priorMonthFile, content: oldContent },
          },
        });
      }
      return jsonResponse({ id: "gist123", files: {} });
    });

    const result = await runBackup();
    expect(result.status).toBe("backed-up");
    const patchCall = calls.find((c) => c.init?.method === "PATCH");
    const body = JSON.parse(patchCall!.init!.body as string);
    expect(Object.keys(body.files)).toEqual([currentMonthFile]);
  });
});

describe("restoreLatestBackup", () => {
  test("overwrites local graph with the latest backup content", async () => {
    const remoteContent = '{"movies":{"restored":{}}}';
    (globalThis as any).fetch = mock(() =>
      jsonResponse({
        id: "gist123",
        files: {
          "backup-2026-08.json": {
            filename: "backup-2026-08.json",
            content: remoteContent,
          },
        },
      }),
    );

    const result = await restoreLatestBackup();
    expect(result.status).toBe("restored");
    expect(localStorage.getItem(GRAPH_STORAGE_KEY)).toBe(remoteContent);
  });

  test("reports no-backup when the gist has no backup files", async () => {
    (globalThis as any).fetch = mock(() =>
      jsonResponse({ id: "gist123", files: {} }),
    );
    const result = await restoreLatestBackup();
    expect(result.status).toBe("no-backup");
  });

  test("errors when not configured", async () => {
    saveSettings({ token: "", gistId: "" });
    const result = await restoreLatestBackup();
    expect(result.status).toBe("error");
  });
});
