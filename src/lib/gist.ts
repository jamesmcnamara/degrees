/** Minimal GitHub Gist REST client used for remote backup. */

const API = "https://api.github.com";

export interface GistFile {
  filename: string;
  content: string;
}

export interface Gist {
  id: string;
  files: Record<string, GistFile>;
}

class GistError extends Error {
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

/** Fetch a gist's metadata and file contents. */
export const getGist = async (token: string, gistId: string): Promise<Gist> => {
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

/** Create a new secret gist containing the given files. */
export const createGist = async (
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
export const updateGistFile = async (
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

export { GistError };
