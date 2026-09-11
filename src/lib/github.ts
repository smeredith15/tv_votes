/**
 * Thin wrapper over the GitHub contents API. The repo is the database: the
 * ledger JSON lives in it, so every vote is a commit with a full history and
 * there is no server to run or pay for.
 */
const API = "https://api.github.com";

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface FileContents<T> {
  data: T;
  /** Blob sha, required to write the file back without clobbering. */
  sha: string;
}

async function request(config: RepoConfig, path: string, init?: RequestInit): Promise<Response> {
  const base = `${API}/repos/${config.owner}/${config.repo}`;
  return fetch(path ? `${base}/${path}` : base, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      // Tokens are pasted, and a pasted token often brings whitespace with it.
      // A stray newline makes fetch reject outright on an invalid header.
      Authorization: `Bearer ${config.token.trim()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });
}

function decode(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function readFile<T>(config: RepoConfig, path: string): Promise<FileContents<T>> {
  const res = await request(config, `contents/${path}?ref=${encodeURIComponent(config.branch)}`);
  if (!res.ok) throw new Error(`Could not read ${path}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { content: string; sha: string };
  return { data: JSON.parse(decode(body.content)) as T, sha: body.sha };
}

export class ConflictError extends Error {}

export async function writeFile(
  config: RepoConfig,
  path: string,
  value: unknown,
  sha: string,
  message: string,
): Promise<string> {
  const res = await request(config, `contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: encode(`${JSON.stringify(value, null, 1)}\n`),
      sha,
      branch: config.branch,
    }),
  });
  // Someone else wrote the file between our read and our write.
  if (res.status === 409 || res.status === 422) throw new ConflictError(await res.text());
  if (!res.ok) throw new Error(`Could not save ${path}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { content: { sha: string } };
  return body.content.sha;
}

/**
 * Report on a token without ever throwing. This backs a button that otherwise
 * sits on "Checking…" forever: a rejected fetch — offline, blocked, or a
 * malformed header from a bad paste — has to come back as an answer, not an
 * unhandled rejection.
 */
export async function checkToken(config: RepoConfig): Promise<{ ok: boolean; detail: string }> {
  if (!config.token.trim()) return { ok: false, detail: "Paste a token first." };

  let res: Response;
  try {
    res = await request(config, "");
  } catch (e) {
    return {
      ok: false,
      detail: `Could not reach GitHub — ${e instanceof Error ? e.message : String(e)}. Check the connection, or a browser extension blocking api.github.com.`,
    };
  }

  if (res.status === 401) return { ok: false, detail: "Token rejected — check it was pasted whole and has not expired." };
  if (res.status === 404) {
    return { ok: false, detail: "Repo not visible to this token — grant it Contents access on this repo." };
  }
  if (!res.ok) return { ok: false, detail: `GitHub said ${res.status}.` };

  try {
    const repo = (await res.json()) as { permissions?: { push?: boolean } };
    return repo.permissions?.push
      ? { ok: true, detail: "Token can read and write this repo." }
      : { ok: false, detail: "Token is read-only — it needs Contents: read and write." };
  } catch {
    return { ok: false, detail: "GitHub replied with something unreadable." };
  }
}
