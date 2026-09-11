/**
 * TMDB client, shared by the browser app and the nightly refresh job.
 *
 * Written as plain ESM so the GitHub Action can run it with bare node while
 * Vite still bundles it into the app.
 */
const BASE = "https://api.themoviedb.org/3";
export const IMAGE_BASE = "https://image.tmdb.org/t/p/w185";

/** TMDB allows bursts, but a small queue keeps a 1,000-show refresh polite. */
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function createClient({ key, region = "US", fetchImpl = fetch }) {
  if (!key) throw new Error("A TMDB API key is required.");

  async function get(path, params = {}) {
    const url = new URL(BASE + path);
    url.searchParams.set("api_key", key);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url);
      // 429 carries a Retry-After; anything else is a real failure.
      if (res.status === 429 && attempt < 4) {
        const wait = Number(res.headers.get("retry-after") ?? 1) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
      return res.json();
    }
  }

  return {
    search: (title, year) =>
      get("/search/tv", { query: title, first_air_date_year: year }).then((r) => r.results ?? []),
    details: (id) => get(`/tv/${id}`, { append_to_response: "external_ids" }),
    providers: (id) => get(`/tv/${id}/watch/providers`).then((r) => r.results?.[region] ?? null),
    /** Shows that premiered in a window, narrowed to first seasons. */
    discover: (from, to, page = 1, options = {}) =>
      get("/discover/tv", {
        "first_air_date.gte": from,
        "first_air_date.lte": to,
        sort_by: "popularity.desc",
        watch_region: region,
        include_adult: false,
        ...options,
        page,
      }),
  };
}

/** TMDB's seven statuses collapse to the only question that matters: more coming? */
export function toReturningStatus(tmdb) {
  switch (tmdb?.status) {
    case "Returning Series":
    case "In Production":
      return "returning";
    case "Ended":
    case "Canceled":
      return "ended";
    default:
      // "Planned", "Pilot", and anything unrecognised are genuinely unknown.
      return "unknown";
  }
}

/** Your split is at 40 minutes: below is a half-hour show, at or above an hour. */
export function toRuntime(tmdb) {
  const runtimes = tmdb?.episode_run_time ?? [];
  const minutes = runtimes.length
    ? runtimes.reduce((a, b) => a + b, 0) / runtimes.length
    : (tmdb?.last_episode_to_air?.runtime ?? null);
  if (!minutes) return null;
  return minutes >= 40 ? 60 : 30;
}

export function toFormat(tmdb, current) {
  const types = (tmdb?.genres ?? []).map((g) => g.name);
  if (tmdb?.type === "Miniseries") return "mini";
  if (types.includes("Documentary")) return "documentary";
  // Anthology and one-and-done are judgement calls; never overwrite a human's.
  return current ?? "series";
}

export function toProviders(entry) {
  if (!entry) return [];
  const kinds = ["flatrate", "free", "ads", "rent", "buy"];
  const seen = new Map();
  for (const kind of kinds) {
    for (const provider of entry[kind] ?? []) {
      // A service that streams it with a subscription wins over renting it.
      if (!seen.has(provider.provider_name)) {
        seen.set(provider.provider_name, {
          name: provider.provider_name,
          type: kind,
          logo: provider.logo_path ?? null,
        });
      }
    }
  }
  return [...seen.values()];
}

/** Real seasons only — TMDB files extras and specials as season 0. */
export function toSeasons(tmdb, existing = []) {
  const watched = new Map(existing.map((s) => [s.number, s.watched]));
  return (tmdb?.seasons ?? [])
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .map((s) => ({
      number: s.season_number,
      name: s.name,
      episodes: s.episode_count,
      airDate: s.air_date ?? null,
      watched: watched.get(s.season_number) ?? false,
    }));
}

/** Strip articles and punctuation so "The 100" and "100, The" compare equal. */
export function matchKey(title) {
  return String(title)
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/,\s*(the|a|an)$/, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Pick the search hit whose title actually matches; popularity breaks ties. */
export function bestMatch(title, results) {
  const key = matchKey(title);
  const exact = results.filter((r) => matchKey(r.name) === key || matchKey(r.original_name) === key);
  const pool = exact.length ? exact : [];
  if (pool.length === 0) return null;
  return pool.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
}
