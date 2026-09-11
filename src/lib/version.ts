/**
 * Noticing when the deployed app has moved on.
 *
 * GitHub Pages serves index.html with ten minutes of caching, so a browser can
 * keep running the old bundle well after a deploy — which is indistinguishable,
 * from the sofa, from the deploy not having happened. version.json is fetched
 * past the cache and compared with what this bundle was stamped with.
 */
export const RUNNING_VERSION = __APP_VERSION__;
export const BUILT_AT = __BUILT_AT__;

export async function publishedVersion(baseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}version.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return body.version ?? null;
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
