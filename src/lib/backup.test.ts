import { beforeEach, describe, expect, test } from "bun:test";
import {
  createBackupGist,
  isBackupConfigured,
  latestBackupFile,
  loadSettings,
  monthKey,
  restoreLatestBackup,
  runBackup,
  saveBackupConfig,
  saveSettings,
  type BackupDriver,
} from "./backup";
import { GRAPH_STORAGE_KEY, SETTINGS_STORAGE_KEY } from "./constants";
import { GistError, type Gist, type GistFile, type GistService } from "./gist";

/** A minimal in-memory localStorage stand-in for tests. */
class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

interface GistCall {
  method: "get" | "create" | "update";
  token: string;
  gistId?: string;
  filename?: string;
  content?: string;
}

/** An in-memory GistService stand-in, seeded directly via `gists`. */
class TestGistService implements GistService {
  gists = new Map<string, Gist>();
  calls: GistCall[] = [];
  /** Overrides `get`'s normal lookup, e.g. to hold a request open. */
  getOverride: ((token: string, gistId: string) => Promise<Gist>) | null = null;

  get = async (token: string, gistId: string): Promise<Gist> => {
    this.calls.push({ method: "get", token, gistId });
    if (this.getOverride) return this.getOverride(token, gistId);
    const gist = this.gists.get(gistId);
    if (!gist) throw new GistError("GitHub API error 404: Not Found", 404);
    return gist;
  };

  create = async (
    token: string,
    _description: string,
    files: GistFile[],
  ): Promise<Gist> => {
    this.calls.push({ method: "create", token });
    const gist: Gist = {
      id: "created-gist",
      files: Object.fromEntries(files.map((f) => [f.filename, f])),
    };
    this.gists.set(gist.id, gist);
    return gist;
  };

  update = async (
    token: string,
    gistId: string,
    filename: string,
    content: string,
  ): Promise<Gist> => {
    this.calls.push({ method: "update", token, gistId, filename, content });
    const current = this.gists.get(gistId) ?? { id: gistId, files: {} };
    const gist = {
      ...current,
      files: { ...current.files, [filename]: { filename, content } },
    };
    this.gists.set(gistId, gist);
    return gist;
  };
}

class TestDriver implements BackupDriver {
  online = true;
  gist = new TestGistService();
  storage = new MemoryStorage();

  isOnline(): boolean {
    return this.online;
  }
}

let driver: TestDriver;

beforeEach(() => {
  driver = new TestDriver();
  saveSettings({ token: "tok", gistId: "gist123" }, driver);
});

describe("backup settings", () => {
  test("preserves partially entered settings without making requests", () => {
    driver = new TestDriver();
    expect(
      saveBackupConfig({ token: "new-token", gistId: "" }, driver),
    ).toEqual({ token: "new-token", gistId: "" });
    expect(loadSettings(driver)).toEqual({ token: "new-token", gistId: "" });
    expect(isBackupConfigured(loadSettings(driver))).toBe(false);
    expect(driver.gist.calls).toEqual([]);
  });

  test("rejects malformed stored settings", () => {
    for (const raw of [
      "null",
      "{}",
      '{"token":5,"gistId":"gist123"}',
      "invalid",
    ]) {
      driver.storage.setItem(SETTINGS_STORAGE_KEY, raw);
      expect(loadSettings(driver)).toBeNull();
    }
  });

  test("retains metadata for the same gist and clears it when the gist changes", () => {
    const settings = {
      token: "tok",
      gistId: "gist123",
      lastBackupAt: "2026-08-01T00:00:00Z",
      lastBackupContent: "{}",
      lastError: "Old error",
    };
    saveSettings(settings, driver);
    expect(
      saveBackupConfig({ token: "new-token", gistId: "gist123" }, driver),
    ).toEqual({ ...settings, token: "new-token" });
    expect(
      saveBackupConfig({ token: "new-token", gistId: "new-gist" }, driver),
    ).toEqual({ token: "new-token", gistId: "new-gist" });
  });

  test("clearing either field prevents backup and restore requests", async () => {
    driver.storage.setItem(GRAPH_STORAGE_KEY, "{}");
    for (const config of [
      { token: "", gistId: "gist123" },
      { token: "tok", gistId: "" },
      { token: " ", gistId: "gist123" },
      { token: "tok", gistId: " " },
    ]) {
      saveBackupConfig(config, driver);
      expect(loadSettings(driver)).toEqual(config);
      expect(isBackupConfigured(loadSettings(driver))).toBe(false);
      expect((await runBackup(driver)).status).toBe("skipped-no-config");
      expect((await restoreLatestBackup(driver)).status).toBe("error");
    }
    expect(driver.gist.calls).toEqual([]);
  });

  test("immediate restore and backup use the newly saved configuration", async () => {
    const remoteContent = '{"movies":{"restored":{}}}';
    driver.gist.gists.set("new-gist", {
      id: "new-gist",
      files: {
        "backup-2026-08.json": {
          filename: "backup-2026-08.json",
          content: remoteContent,
        },
      },
    });
    saveBackupConfig({ token: "new-token", gistId: "new-gist" }, driver);
    expect((await restoreLatestBackup(driver)).status).toBe("restored");
    expect(driver.storage.getItem(GRAPH_STORAGE_KEY)).toBe(remoteContent);

    driver.storage.setItem(GRAPH_STORAGE_KEY, '{"movies":{}}');
    expect((await runBackup(driver)).status).toBe("backed-up");

    expect(driver.gist.calls.map((call) => call.method)).toEqual([
      "get",
      "get",
      "update",
    ]);
    for (const call of driver.gist.calls) {
      expect(call.token).toBe("new-token");
      expect(call.gistId).toBe("new-gist");
    }
  });

  test("an in-flight backup cannot update another configuration's metadata", async () => {
    driver.storage.setItem(GRAPH_STORAGE_KEY, "{}");
    const pending = Promise.withResolvers<Gist>();
    driver.gist.getOverride = () => pending.promise;

    const backupPromise = runBackup(driver);
    saveBackupConfig({ token: "tok", gistId: "new-gist" }, driver);

    pending.resolve({
      id: "gist123",
      files: {
        "backup-2026-08.json": {
          filename: "backup-2026-08.json",
          content: "{}",
        },
      },
    });

    expect((await backupPromise).status).toBe("skipped-unchanged");
    expect(loadSettings(driver)).toEqual({ token: "tok", gistId: "new-gist" });
  });

  test("an in-flight error cannot update another configuration's metadata", async () => {
    driver.storage.setItem(GRAPH_STORAGE_KEY, "{}");
    const pending = Promise.withResolvers<Gist>();
    driver.gist.getOverride = () => pending.promise;

    const backupPromise = runBackup(driver);
    saveBackupConfig({ token: "new-token", gistId: "gist123" }, driver);

    pending.reject(new GistError("GitHub API error 404: Not Found", 404));

    expect((await backupPromise).status).toBe("error");
    expect(loadSettings(driver)).toEqual({
      token: "new-token",
      gistId: "gist123",
    });
  });

  test("creates a gist from token-only settings and persists its ID", async () => {
    saveBackupConfig({ token: "tok", gistId: "" }, driver);
    driver.storage.setItem(GRAPH_STORAGE_KEY, "{}");
    expect(await createBackupGist("tok", driver)).toBe("created-gist");
    expect(driver.gist.calls).toEqual([{ method: "create", token: "tok" }]);
    expect(loadSettings(driver)).toMatchObject({
      token: "tok",
      gistId: "created-gist",
      lastBackupContent: "{}",
    });
    expect(isBackupConfigured(loadSettings(driver))).toBe(true);
  });
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
    saveSettings({ token: "", gistId: "" }, driver);
    const result = await runBackup(driver);
    expect(result.status).toBe("skipped-no-config");
  });

  test("skips when offline", async () => {
    driver.online = false;
    driver.storage.setItem(GRAPH_STORAGE_KEY, '{"movies":{}}');
    const result = await runBackup(driver);
    expect(result.status).toBe("skipped-offline");
  });

  test("skips writing when content matches the latest backup file", async () => {
    const content = '{"movies":{"m1":{}}}';
    driver.storage.setItem(GRAPH_STORAGE_KEY, content);
    driver.gist.gists.set("gist123", {
      id: "gist123",
      files: {
        "backup-2000-01.json": { filename: "backup-2000-01.json", content },
      },
    });

    const result = await runBackup(driver);
    expect(result.status).toBe("skipped-unchanged");
    expect(driver.gist.calls).toEqual([
      { method: "get", token: "tok", gistId: "gist123" },
    ]);
  });

  test("updates the current month's file in place when content changed", async () => {
    const oldContent = '{"movies":{}}';
    const newContent = '{"movies":{"m1":{}}}';
    driver.storage.setItem(GRAPH_STORAGE_KEY, newContent);

    const currentMonthFile = `backup-${monthKey(new Date())}.json`;
    driver.gist.gists.set("gist123", {
      id: "gist123",
      files: {
        [currentMonthFile]: { filename: currentMonthFile, content: oldContent },
      },
    });

    const result = await runBackup(driver);
    expect(result.status).toBe("backed-up");
    const updateCall = driver.gist.calls.find((c) => c.method === "update");
    expect(updateCall).toEqual({
      method: "update",
      token: "tok",
      gistId: "gist123",
      filename: currentMonthFile,
      content: newContent,
    });
  });

  test("starts a new month's file when the latest backup is from a prior month", async () => {
    const oldContent = '{"movies":{}}';
    const newContent = '{"movies":{"m1":{}}}';
    driver.storage.setItem(GRAPH_STORAGE_KEY, newContent);

    const currentMonthFile = `backup-${monthKey(new Date())}.json`;
    const priorMonthFile = "backup-2000-01.json"; // definitely in the past
    driver.gist.gists.set("gist123", {
      id: "gist123",
      files: {
        [priorMonthFile]: { filename: priorMonthFile, content: oldContent },
      },
    });

    const result = await runBackup(driver);
    expect(result.status).toBe("backed-up");
    const updateCall = driver.gist.calls.find((c) => c.method === "update");
    expect(updateCall?.filename).toBe(currentMonthFile);
  });
});

describe("restoreLatestBackup", () => {
  test("overwrites local graph with the latest backup content", async () => {
    const remoteContent = '{"movies":{"restored":{}}}';
    driver.gist.gists.set("gist123", {
      id: "gist123",
      files: {
        "backup-2026-08.json": {
          filename: "backup-2026-08.json",
          content: remoteContent,
        },
      },
    });

    const result = await restoreLatestBackup(driver);
    expect(result.status).toBe("restored");
    expect(driver.storage.getItem(GRAPH_STORAGE_KEY)).toBe(remoteContent);
  });

  test("reports no-backup when the gist has no backup files", async () => {
    driver.gist.gists.set("gist123", { id: "gist123", files: {} });
    const result = await restoreLatestBackup(driver);
    expect(result.status).toBe("no-backup");
  });

  test("errors when not configured", async () => {
    saveSettings({ token: "", gistId: "" }, driver);
    const result = await restoreLatestBackup(driver);
    expect(result.status).toBe("error");
  });
});
