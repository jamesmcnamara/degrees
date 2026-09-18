/**
 * Settings screen: configure remote backup to a GitHub Gist (a fine-grained
 * PAT scoped to Gists, plus the gist ID) and trigger manual backup/restore.
 */

import { useState } from "react";
import {
  createBackupGist,
  isBackupConfigured,
  loadSettings,
  restoreLatestBackup,
  runBackup,
  saveBackupConfig,
  type BackupSettings,
} from "@/lib/backup";

const formatTime = (iso?: string): string => {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
};

export function Settings() {
  const [settings, setSettings] = useState<BackupSettings | null>(() =>
    loadSettings(),
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const handleConfigChange = (token: string, gistId: string) => {
    try {
      const next = saveBackupConfig({
        token: token.trim(),
        gistId: gistId.trim(),
      });
      setSettings(next);
      setSaveFailed(false);
      setStatus(null);
    } catch {
      setSaveFailed(true);
      setStatus(
        "Couldn't save settings in this browser. Your edit wasn't saved. Try editing again.",
      );
    }
  };

  const handleCreateGist = async () => {
    if (busy || saveFailed) return;
    const token = settings?.token;
    if (!token) {
      setStatus("Enter a token first.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await createBackupGist(token);
      setSettings(loadSettings());
      setStatus("Created gist and backed up.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleBackupNow = async () => {
    if (busy || saveFailed || !isBackupConfigured(settings)) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await runBackup();
      setSettings(loadSettings());
      setStatus(result.message ?? prettyPrintBackupStatus(result.status));
    } catch {
      setStatus("Couldn't save backup status in this browser. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (busy || saveFailed || !isBackupConfigured(settings)) return;
    if (
      !confirm(
        "Restore will overwrite all local data with the latest backup. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus(null);
    const result = await restoreLatestBackup();
    setBusy(false);
    if (result.status === "restored") {
      setStatus("Restored. Reloading…");
      setTimeout(() => location.reload(), 600);
    } else if (result.status === "no-backup") {
      setStatus("No backup found in that gist.");
    } else {
      setStatus(result.message ?? "Restore failed.");
    }
  };

  return (
    <SettingsPresenter
      settings={settings}
      busy={busy}
      status={status}
      saveFailed={saveFailed}
      handleConfigChange={handleConfigChange}
      handleCreateGist={handleCreateGist}
      handleBackupNow={handleBackupNow}
      handleRestore={handleRestore}
    />
  );
}

interface SettingsPresenterProps {
  settings: BackupSettings | null;
  busy: boolean;
  status: string | null;
  saveFailed: boolean;
  handleConfigChange(token: string, gistId: string): void;
  handleCreateGist(): void;
  handleBackupNow(): void;
  handleRestore(): void;
}

function SettingsPresenter({
  settings,
  busy,
  status,
  saveFailed,
  handleConfigChange,
  handleCreateGist,
  handleBackupNow,
  handleRestore,
}: SettingsPresenterProps) {
  const token = settings?.token ?? "";
  const gistId = settings?.gistId ?? "";
  const canRun = !busy && !saveFailed && isBackupConfigured(settings);

  return (
    <div className="settings">
      <section className="settings__section">
        <h2>Remote backup</h2>
        <p className="muted">
          Backs up your data to a private GitHub Gist so it survives losing this
          device. Requires a fine-grained personal access token with
          &ldquo;Gists: read and write&rdquo; permission.
        </p>
        <p className="muted">
          Settings save automatically in this browser.{" "}
          The token is stored in this browser&apos;s local storage, unencrypted.
          Only use a token scoped to gists.
        </p>

        <label className="field">
          <span className="field__label">Personal access token</span>
          <input
            className="field__input"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => handleConfigChange(e.target.value, gistId)}
            disabled={busy}
            placeholder="github_pat_…"
          />
        </label>

        <label className="field">
          <span className="field__label">Gist ID</span>
          <input
            className="field__input"
            type="text"
            autoComplete="off"
            value={gistId}
            onChange={(e) => handleConfigChange(token, e.target.value)}
            disabled={busy}
            placeholder="Leave blank to create one"
          />
        </label>

        <div className="settings__actions">
          {!gistId && (
            <button
              type="button"
              className="btn btn--small"
              onClick={handleCreateGist}
              disabled={busy || saveFailed || !token.trim()}
            >
              Create gist
            </button>
          )}
          <button
            type="button"
            className="btn btn--small"
            onClick={handleBackupNow}
            disabled={!canRun}
          >
            Back up now
          </button>
          <button
            type="button"
            className="btn btn--small"
            onClick={handleRestore}
            disabled={!canRun}
          >
            Restore latest backup
          </button>
        </div>

        {status && (
          <p className="settings__status" role="status">{status}</p>
        )}

        <p className="muted">
          Last backup: {formatTime(settings?.lastBackupAt)}
          {settings?.lastError ? ` — last error: ${settings?.lastError}` : ""}
        </p>
      </section>
    </div>
  );
}

function prettyPrintBackupStatus(status: string | null): string {
  if (!status) return "";
  switch (status) {
    case "backed-up":
      return "Backed up.";
    case "skipped-unchanged":
      return "No changes since last backup.";
    case "skipped-offline":
      return "You're offline.";
    case "skipped-no-config":
      return "Configure a token and gist first.";
    default:
      return status;
  }
}
