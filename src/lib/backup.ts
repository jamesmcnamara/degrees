/**
 * Periodic remote backup of the localStorage graph blob to a GitHub Gist.
 *
 * Scheme: one secret gist with one file per month (`backup-YYYY-MM.json`).
 * Before writing we compare against the most recent existing backup file and
 * skip the network write if nothing changed. A new month's file is only
 * created once the content actually differs from the latest stored file, so
 * an unused month doesn't produce a redundant empty-diff file.
 */

import { get, maxBy } from "shades";
import { GRAPH_STORAGE_KEY, SETTINGS_STORAGE_KEY } from "./constants";
import {
  type GistService,
  GistError,
  type GistFile,
  ProdGistService,
} from "./gist";

const FILE_PREFIX = "backup-";
const FILE_SUFFIX = ".json";
const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_RUN_GAP_MS = 60 * 1000; // debounce guard for event-triggered runs

export interface BackupSettings {
  token: string;
  gistId: string;
  lastBackupAt?: string;
  lastBackupContent?: string;
  lastError?: string;
}

export interface BackupDriver {
  storage: Pick<Storage, "getItem" | "setItem">;
  gist: GistService;
  isOnline(): boolean;
}

export const prodDriver: BackupDriver = {
  storage: localStorage,
  gist: new ProdGistService(),
  isOnline: () => navigator.onLine !== false,
};

export const loadSettings = (
  driver: BackupDriver = prodDriver,
): BackupSettings | null => {
  try {
    const raw = driver.storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const settings: unknown = JSON.parse(raw);
    return isBackupSettings(settings) ? settings : null;
  } catch {
    return null;
  }
};

export const saveSettings = (
  settings: BackupSettings,
  driver: BackupDriver,
): void => {
  driver.storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

export function isBackupSettings(obj: unknown): obj is BackupSettings {
  if (typeof obj !== "object" || obj === null) return false;
  const s = obj as BackupSettings;
  return (
    typeof s.token === "string" &&
    typeof s.gistId === "string" &&
    (!s.lastBackupAt || typeof s.lastBackupAt === "string") &&
    (!s.lastBackupContent || typeof s.lastBackupContent === "string") &&
    (!s.lastError || typeof s.lastError === "string")
  );
}

export const isBackupConfigured = (
  settings: BackupSettings | null,
): settings is BackupSettings =>
  !!settings?.token.trim() && !!settings.gistId.trim();

export const saveBackupConfig = (
  config: Pick<BackupSettings, "token" | "gistId">,
  driver: BackupDriver = prodDriver,
): BackupSettings => {
  const current = loadSettings(driver);
  const next = {
    ...(current?.gistId === config.gistId ? current : {}),
    ...config,
  };
  saveSettings(next, driver);
  return next;
};

const patchSettings = (
  expected: BackupSettings,
  patch: Partial<
    Pick<BackupSettings, "lastBackupAt" | "lastBackupContent" | "lastError">
  >,
  driver: BackupDriver,
): void => {
  const current = loadSettings(driver);
  if (current?.token === expected.token && current.gistId === expected.gistId) {
    saveSettings({ ...current, ...patch }, driver);
  }
};

/** Format a Date as `YYYY-MM`. */
export const monthKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const filenameFor = (key: string): string =>
  `${FILE_PREFIX}${key}${FILE_SUFFIX}`;

const monthKeyFromFilename = (filename: string): string | null => {
  if (!filename.startsWith(FILE_PREFIX) || !filename.endsWith(FILE_SUFFIX)) {
    return null;
  }
  return filename.slice(
    FILE_PREFIX.length,
    filename.length - FILE_SUFFIX.length,
  );
};

interface MonthlyGistFile extends GistFile {
  key: string;
}

/** Find the most recent `backup-*.json` file in a gist's file list. */
export const latestBackupFile = (
  filesObj: Record<string, GistFile>,
): MonthlyGistFile | null => {
  const files = Object.values(filesObj);
  if (files.length === 0) return null;
  const best = get(
    maxBy((file: GistFile) => monthKeyFromFilename(file.filename)),
  )(files);

  if (best) {
    return {
      key: monthKeyFromFilename(best.filename) ?? "",
      filename: best.filename,
      content: best.content,
    };
  }
  return null;
};

const readLocalGraphJson = (driver: BackupDriver): string | null => {
  return driver.storage.getItem(GRAPH_STORAGE_KEY);
};

type BackupStatus =
  | "skipped-no-config"
  | "skipped-offline"
  | "skipped-unchanged"
  | "backed-up"
  | "error";

export interface BackupResult {
  status: BackupStatus;
  message?: string;
}

/** Run a single backup pass: compare against remote, write only if changed. */
export const runBackup = async (
  driver: BackupDriver = prodDriver,
): Promise<BackupResult> => {
  const settings = loadSettings(driver);
  if (!isBackupConfigured(settings)) {
    return { status: "skipped-no-config" };
  }
  if (!driver.isOnline()) {
    return { status: "skipped-offline" };
  }

  const content = readLocalGraphJson(driver);
  if (content == null) {
    return {
      status: "skipped-no-config",
      message: "No local data to back up.",
    };
  }

  try {
    const gist = await driver.gist.get(settings.token, settings.gistId);
    const latest = latestBackupFile(gist.files);

    if (latest && latest.content === content) {
      patchSettings(
        settings,
        {
          lastBackupAt: new Date().toISOString(),
          lastError: undefined,
        },
        driver,
      );
      return { status: "skipped-unchanged" };
    }

    const currentMonth = monthKey(new Date());
    // Reuse the latest file if it's still the current month; otherwise (or if
    // there's no backup yet) write a fresh file for the current month.
    const targetKey =
      latest && latest.key === currentMonth ? latest.key : currentMonth;
    const filename = filenameFor(targetKey);

    await driver.gist.update(
      settings.token,
      settings.gistId,
      filename,
      content,
    );
    patchSettings(
      settings,
      {
        lastBackupAt: new Date().toISOString(),
        lastBackupContent: content,
        lastError: undefined,
      },
      driver,
    );
    return { status: "backed-up" };
  } catch (err) {
    const message = err instanceof GistError ? err.message : String(err);
    patchSettings(settings, { lastError: message }, driver);
    return { status: "error", message };
  }
};

/** Create a new secret gist seeded with the current month's backup file. */
export const createBackupGist = async (
  token: string,
  driver: BackupDriver = prodDriver,
): Promise<string> => {
  const content = readLocalGraphJson(driver) ?? "{}";
  const filename = filenameFor(monthKey(new Date()));
  const gist = await driver.gist.create(token, "six-degrees backup", [
    { filename, content },
  ]);
  saveSettings(
    {
      token,
      gistId: gist.id,
      lastBackupAt: new Date().toISOString(),
      lastBackupContent: content,
      lastError: undefined,
    },
    driver,
  );
  return gist.id;
};

export interface RestoreResult {
  status: "restored" | "no-backup" | "error";
  message?: string;
}

/** Fetch the latest backup file from the gist and overwrite local storage. */
export const restoreLatestBackup = async (
  driver: BackupDriver = prodDriver,
): Promise<RestoreResult> => {
  const settings = loadSettings(driver);
  if (!isBackupConfigured(settings)) {
    return { status: "error", message: "Backup is not configured." };
  }
  try {
    const gist = await driver.gist.get(settings.token, settings.gistId);
    const latest = latestBackupFile(gist.files);
    if (!latest) return { status: "no-backup" };

    driver.storage.setItem(GRAPH_STORAGE_KEY, latest.content);
    patchSettings(settings, { lastBackupContent: latest.content }, driver);
    return { status: "restored" };
  } catch (err) {
    const message = err instanceof GistError ? err.message : String(err);
    return { status: "error", message };
  }
};

let autoBackupTimer: number | undefined;
let lastRunAt = 0;

const triggerBackup = (driver: BackupDriver): void => {
  const now = Date.now();
  if (now - lastRunAt < MIN_RUN_GAP_MS) return;
  lastRunAt = now;
  void runBackup(driver);
};

/**
 * Start automatic periodic backup: a recurring interval plus opportunistic
 * runs when the tab becomes visible or the browser regains connectivity.
 * Safe to call once at app startup; returns a stop function.
 */
export const startAutoBackup = (
  driver: BackupDriver = prodDriver,
): (() => void) => {
  if (autoBackupTimer) clearInterval(autoBackupTimer);

  autoBackupTimer = setInterval(triggerBackup, AUTO_BACKUP_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") triggerBackup(driver);
  };
  const onOnline = () => triggerBackup(driver);

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);

  // Fire an initial opportunistic backup shortly after startup.
  const startupTimer = setTimeout(triggerBackup, 5000);

  return () => {
    if (autoBackupTimer) clearInterval(autoBackupTimer);
    autoBackupTimer = undefined;
    clearTimeout(startupTimer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
  };
};
