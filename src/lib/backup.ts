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
  createGist,
  getGist,
  updateGistFile,
  GistError,
  type GistFile,
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

export const loadSettings = (): BackupSettings | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const settings = JSON.parse(raw) as BackupSettings;
    if (!settings.token || !settings.gistId) return null;
    return settings;
  } catch {
    return null;
  }
};

export const saveSettings = (settings: BackupSettings): void => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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

const patchSettings = (
  patch: Partial<BackupSettings>,
): BackupSettings | null => {
  const next = { ...(loadSettings() ?? {}), ...patch };
  if (isBackupSettings(next)) {
    saveSettings(next);
    return next;
  }
  return null;
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
  files: Record<string, GistFile>,
): MonthlyGistFile | null => {
  const best = get(
    maxBy((file: GistFile) => monthKeyFromFilename(file.filename)),
  )(Object.values(files));

  if (best) {
    return {
      key: monthKeyFromFilename(best.filename) ?? "",
      filename: best.filename,
      content: best.content,
    };
  }
  return null;
};

const readLocalGraphJson = (): string | null => {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(GRAPH_STORAGE_KEY);
};

export interface BackupResult {
  status:
    | "skipped-no-config"
    | "skipped-offline"
    | "skipped-unchanged"
    | "backed-up"
    | "error";
  message?: string;
}

const isOnline = (): boolean =>
  typeof navigator === "undefined" || navigator.onLine !== false;

/** Run a single backup pass: compare against remote, write only if changed. */
export const runBackup = async (): Promise<BackupResult> => {
  const settings = loadSettings();
  if (!settings) {
    return { status: "skipped-no-config" };
  }
  if (!isOnline()) {
    return { status: "skipped-offline" };
  }

  const content = readLocalGraphJson();
  if (content == null) {
    return {
      status: "skipped-no-config",
      message: "No local data to back up.",
    };
  }

  try {
    const gist = await getGist(settings.token, settings.gistId);
    const latest = latestBackupFile(gist.files);

    if (latest && latest.content === content) {
      patchSettings({
        lastBackupAt: new Date().toISOString(),
        lastError: undefined,
      });
      return { status: "skipped-unchanged" };
    }

    const currentMonth = monthKey(new Date());
    // Reuse the latest file if it's still the current month; otherwise (or if
    // there's no backup yet) write a fresh file for the current month.
    const targetKey =
      latest && latest.key === currentMonth ? latest.key : currentMonth;
    const filename = filenameFor(targetKey);

    await updateGistFile(settings.token, settings.gistId, filename, content);
    patchSettings({
      lastBackupAt: new Date().toISOString(),
      lastBackupContent: content,
      lastError: undefined,
    });
    return { status: "backed-up" };
  } catch (err) {
    const message = err instanceof GistError ? err.message : String(err);
    patchSettings({ lastError: message });
    return { status: "error", message };
  }
};

/** Create a new secret gist seeded with the current month's backup file. */
export const createBackupGist = async (token: string): Promise<string> => {
  const content = readLocalGraphJson() ?? "{}";
  const filename = filenameFor(monthKey(new Date()));
  const gist = await createGist(token, "six-degrees backup", [
    { filename, content },
  ]);
  patchSettings({
    token,
    gistId: gist.id,
    lastBackupAt: new Date().toISOString(),
    lastBackupContent: content,
    lastError: undefined,
  });
  return gist.id;
};

export interface RestoreResult {
  status: "restored" | "no-backup" | "error";
  message?: string;
}

/** Fetch the latest backup file from the gist and overwrite local storage. */
export const restoreLatestBackup = async (): Promise<RestoreResult> => {
  const settings = loadSettings();
  if (!settings) {
    return { status: "error", message: "Backup is not configured." };
  }
  try {
    const gist = await getGist(settings.token, settings.gistId);
    const latest = latestBackupFile(gist.files);
    if (!latest) return { status: "no-backup" };

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(GRAPH_STORAGE_KEY, latest.content);
    }
    patchSettings({ lastBackupContent: latest.content });
    return { status: "restored" };
  } catch (err) {
    const message = err instanceof GistError ? err.message : String(err);
    return { status: "error", message };
  }
};

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;
let lastRunAt = 0;

const triggerBackup = (): void => {
  const now = Date.now();
  if (now - lastRunAt < MIN_RUN_GAP_MS) return;
  lastRunAt = now;
  void runBackup();
};

/**
 * Start automatic periodic backup: a recurring interval plus opportunistic
 * runs when the tab becomes visible or the browser regains connectivity.
 * Safe to call once at app startup; returns a stop function.
 */
export const startAutoBackup = (): (() => void) => {
  if (typeof window === "undefined") return () => {};
  if (autoBackupTimer) clearInterval(autoBackupTimer);

  autoBackupTimer = setInterval(triggerBackup, AUTO_BACKUP_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") triggerBackup();
  };
  const onOnline = () => triggerBackup();

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);

  // Fire an initial opportunistic backup shortly after startup.
  const startupTimer = setTimeout(triggerBackup, 5000);

  return () => {
    if (autoBackupTimer) clearInterval(autoBackupTimer);
    autoBackupTimer = null;
    clearTimeout(startupTimer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
  };
};
