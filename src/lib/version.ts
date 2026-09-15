/**
 * Noticing when the deployed app has moved on.
 *
 * GitHub Pages serves index.html with ten minutes of caching, so a browser can
 * keep running the old bundle well after a deploy — which is indistinguishable,
 * from the sofa, from the deploy not having happened.
 *
 * What is compared is the bundle's name, which Vite content-hashes: it changes
 * when the app changes and not otherwise. The commit will not do, because every
 * vote saved from the app is a commit that redeploys an identical app.
 */
/** The file this code is running from, which is the bundle in a build. */
export const RUNNING_BUNDLE = import.meta.url.split("/").pop() ?? "";

export interface VersionInfo {
  /** Bundle file name, without its directory. */
  bundle: string;
  commit: string;
  builtAt: string;
}

/**
 * What is published right now.
 *
 * Nothing about the build is compiled into the bundle — no commit, no
 * timestamp — because anything that changes per build would change the
 * bundle's hash and make every deploy look like a new app.
 */
export async function fetchVersion(baseUrl: string): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`${baseUrl}version.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<VersionInfo>;
    if (!body.bundle) return null;
    // Compare names only: where it is served from is not where this module was
    // loaded from.
    return {
      bundle: body.bundle.split("/").pop() ?? "",
      commit: body.commit ?? "",
      builtAt: body.builtAt ?? "",
    };
  } catch {
    // Offline, or opened from a file; nothing to say either way.
    return null;
  }
}

/**
 * Reload past the cached HTML. A plain reload can be served the same stale
 * index.html that caused the problem, so the URL changes with it.
 */
export function reloadTo(version: string): void {
  const url = new URL(location.href);
  url.searchParams.set("v", version);
  location.replace(url.toString());
}
