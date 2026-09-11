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
  return fetch(`${API}/repos/${config.owner}/${config.repo}/${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
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

export async function checkToken(config: RepoConfig): Promise<{ ok: boolean; detail: string }> {
  const res = await request(config, "");
  if (res.status === 401) return { ok: false, detail: "Token rejected — check it was pasted whole." };
  if (res.status === 404) {
    return { ok: false, detail: "Repo not visible to this token — grant it Contents access." };
  }
  if (!res.ok) return { ok: false, detail: `GitHub said ${res.status}.` };
  const repo = (await res.json()) as { permissions?: { push?: boolean } };
  return repo.permissions?.push
    ? { ok: true, detail: "Token can read and write this repo." }
    : { ok: false, detail: "Token is read-only — it needs Contents: read and write." };
}
