/**
 * The repo is the database, reached through GitHub's git data API.
 *
 * Not the contents API: that one stops returning a file's content once the
 * file passes a megabyte, handing back an empty string instead of an error,
 * and shows.json went past that the moment TMDB filled in every season and
 * streaming service. Blobs have no such ceiling, and committing a tree lets a
 * save touch several files in one commit instead of one commit apiece.
 */
const API = "https://api.github.com";

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

/** The repo at one moment: the commit it was read at, and the files read. */
export interface Snapshot {
  headSha: string;
  files: Record<string, string>;
}

export class ConflictError extends Error {}

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

async function json<T>(config: RepoConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await request(config, path, init);
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Base64 for a UTF-8 string, in chunks so a megabyte does not crawl. */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function headSha(config: RepoConfig): Promise<string> {
  const ref = await json<{ object: { sha: string } }>(
    config,
    `git/ref/heads/${encodeURIComponent(config.branch)}`,
  );
  return ref.object.sha;
}

/** Read the given paths at the branch's current commit. */
export async function readRepo(config: RepoConfig, paths: string[]): Promise<Snapshot> {
  const sha = await headSha(config);
  const tree = await json<{ tree: { path: string; sha: string; type: string }[]; truncated?: boolean }>(
    config,
    `git/trees/${sha}?recursive=1`,
  );
  const bySha = new Map(tree.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]));

  const entries = await Promise.all(
    paths.map(async (path) => {
      const blob = bySha.get(path);
      if (!blob) {
        if (tree.truncated) {
          throw new Error(`Could not find ${path}: the repo listing came back truncated.`);
        }
        // Not an error: a data file added after this repo was last written
        // simply is not there, and reads as empty.
        return [path, undefined] as const;
      }
      const res = await request(config, `git/blobs/${blob}`, {
        headers: { Accept: "application/vnd.github.raw" },
      });
      if (!res.ok) throw new Error(`Could not read ${path}: ${res.status}`);
      return [path, await res.text()] as const;
    }),
  );

  return {
    headSha: sha,
    files: Object.fromEntries(entries.filter(([, body]) => body !== undefined)) as Record<string, string>,
  };
}

/**
 * Commit the given files on top of `parentSha`, in one commit.
 *
 * Fails with ConflictError when the branch has moved since — someone else
 * saved first, and their work must be replayed onto rather than overwritten.
 */
export async function commitFiles(
  config: RepoConfig,
  parentSha: string,
  files: Record<string, string>,
  message: string,
): Promise<string> {
  const parent = await json<{ tree: { sha: string } }>(config, `git/commits/${parentSha}`);

  const blobs = await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const blob = await json<{ sha: string }>(config, "git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: encodeBase64(content), encoding: "base64" }),
      });
      return { path, mode: "100644", type: "blob", sha: blob.sha };
    }),
  );

  const tree = await json<{ sha: string }>(config, "git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: blobs }),
  });

  const commit = await json<{ sha: string }>(config, "git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  });

  // force stays off, so this only moves the branch if nobody else has.
  const res = await request(config, `git/refs/heads/${encodeURIComponent(config.branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  if (res.status === 422) throw new ConflictError(await res.text());
  if (!res.ok) throw new Error(`Could not update the branch: ${res.status} ${await res.text()}`);

  return commit.sha;
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
