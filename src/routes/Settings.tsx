/**
 * Settings screen: configure remote backup to a GitHub Gist (a fine-grained
 * PAT scoped to Gists, plus the gist ID) and trigger manual backup/restore.
 */

import { useState } from "react";
import {
  createBackupGist,
  isBackupSettings,
  loadSettings,
  restoreLatestBackup,
  runBackup,
  saveSettings,
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

  const persist = (patch: Partial<BackupSettings>) => {
    const next = { ...loadSettings(), ...patch };
    if (isBackupSettings(next)) {
      saveSettings(next);
      setSettings(next);
    } else {
      setStatus(`Invalid settings: ${JSON.stringify(next)}`);
    }
  };

  const handleSaveConfig = (token: string, gistId: string) => {
    persist({ token, gistId });
    setStatus("Saved.");
  };

  const handleCreateGist = async (
    token: string,
    setGist: (id: string) => void,
  ) => {
    if (!token) {
      setStatus("Enter a token first.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const id = await createBackupGist(token);
      setGist(id);
      setSettings(loadSettings());
      setStatus("Created gist and backed up.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleBackupNow = async () => {
    setBusy(true);
    setStatus(null);
    const result = await runBackup();
    setSettings(loadSettings());
    setBusy(false);
    setStatus(prettyPrintBackupStatus(result.status));
  };

  const handleRestore = async () => {
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
      handleSaveConfig={handleSaveConfig}
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
  handleSaveConfig(token: string, gistId: string): void;
  handleCreateGist(token: string, setGist: (id: string) => void): void;
  handleBackupNow(): void;
  handleRestore(): void;
}

function SettingsPresenter({
  settings,
  busy,
  status,
  handleSaveConfig,
  handleCreateGist,
  handleBackupNow,
  handleRestore,
}: SettingsPresenterProps) {
  const [token, setToken] = useState(settings?.token ?? "");
  const [gistId, setGistId] = useState(settings?.gistId ?? "");

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
            onChange={(e) => setToken(e.target.value)}
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
            onChange={(e) => setGistId(e.target.value)}
            placeholder="Leave blank to create one"
          />
        </label>

        <div className="settings__actions">
          <button
            type="button"
            className="btn btn--small"
            onClick={() => handleSaveConfig(token, gistId)}
            disabled={busy}
          >
            Save
          </button>
          {!gistId && (
            <button
              type="button"
              className="btn btn--small"
              onClick={() => handleCreateGist(token, setGistId)}
              disabled={busy || !token}
            >
              Create gist
            </button>
          )}
          <button
            type="button"
            className="btn btn--small"
            onClick={handleBackupNow}
            disabled={busy || !settings?.gistId}
          >
            Back up now
          </button>
          <button
            type="button"
            className="btn btn--small"
            onClick={handleRestore}
            disabled={busy || !settings?.gistId}
          >
            Restore latest backup
          </button>
        </div>

        {status && <p className="settings__status">{status}</p>}

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
