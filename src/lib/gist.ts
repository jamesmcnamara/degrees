/** Minimal GitHub Gist REST client used for remote backup. */

import type { BackupDriver } from "./backup";

const API = "https://api.github.com";

export interface GistService {
  get(token: string, gistId: string): Promise<Gist>;
  create(token: string, description: string, files: GistFile[]): Promise<Gist>;
  update(
    token: string,
    gistId: string,
    filename: string,
    content: string,
  ): Promise<Gist>;
}

export interface GistFile {
  filename: string;
  content: string;
}

export interface Gist {
  id: string;
  files: Record<string, GistFile>;
}

export class GistError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GistError";
  }
}

const headers = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
});

const assertOk = async (res: Response): Promise<void> => {
  if (res.ok) return;
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string };
    detail = body.message ?? "";
  } catch {
    // ignore non-JSON error bodies
  }
  throw new GistError(
    `GitHub API error ${res.status}${detail ? `: ${detail}` : ""}`,
    res.status,
  );
};

export class ProdGistService implements GistService {
  get = async (token: string, gistId: string): Promise<Gist> => {
    const res = await fetch(`${API}/gists/${gistId}`, {
      headers: headers(token),
    });
    await assertOk(res);

    const data = (await res.json()) as any;

    // GitHub can omit/truncate `content` for larger files; fall back to `raw_url`.
    await Promise.all(
      Object.values(data.files ?? {}).map(async (file: any) => {
        if (typeof file.content === "string") return;
        if (!file.raw_url) {
          throw new GistError("Gist file content missing (no raw_url)", 500);
        }
        const textRes = await fetch(file.raw_url, { headers: headers(token) });
        await assertOk(textRes);
        file.content = await textRes.text();
      }),
    );

    return data as Gist;
  };

  create = async (
    token: string,
    description: string,
    files: GistFile[],
  ): Promise<Gist> => {
    const body = {
      description,
      public: false,
      files: Object.fromEntries(
        files.map((f) => [f.filename, { content: f.content }]),
      ),
    };
    const res = await fetch(`${API}/gists`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
    });
    await assertOk(res);
    return (await res.json()) as Gist;
  };

  /** Update (or add) a single file within an existing gist. */
  update = async (
    token: string,
    gistId: string,
    filename: string,
    content: string,
  ): Promise<Gist> => {
    const res = await fetch(`${API}/gists/${gistId}`, {
      method: "PATCH",
      headers: headers(token),
      body: JSON.stringify({ files: { [filename]: { content } } }),
    });
    await assertOk(res);
    return (await res.json()) as Gist;
  };
}
