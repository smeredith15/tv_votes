/**
 * Nightly metadata refresh: match shows to TMDB, then pull seasons, streaming
 * providers, and returning/ended status. Run by the refresh workflow, but safe
 * to run by hand with TMDB_API_KEY set.
 *
 *   node scripts/refresh.mjs [--limit 200] [--all] [--stale-days 7]
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  bestMatch,
  createClient,
  mapLimit,
  toFormat,
  toProviders,
  toReturningStatus,
  toRuntime,
  toSeasons,
} from "./tmdb.mjs";

const SHOWS = "data/shows.json";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const ALL = process.argv.includes("--all");
const LIMIT = Number(arg("limit", 250));
const STALE_DAYS = Number(arg("stale-days", 7));

/**
 * Refresh order: never-matched shows first, then whatever went stale longest
 * ago. Returning shows go stale twice as fast, since those are the ones that
 * gain seasons and change streaming homes.
 */
function staleness(show, now) {
  if (!show.tmdbId) return Infinity;
  const updated = show.providersUpdated ? Date.parse(show.providersUpdated) : 0;
  const days = (now - updated) / 86400000;
  return show.status === "returning" ? days * 2 : days;
}

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("Set TMDB_API_KEY.");
  const tmdb = createClient({ key, region: process.env.TMDB_REGION ?? "US" });

  const file = JSON.parse(readFileSync(SHOWS, "utf8"));
  const now = Date.now();
  const queue = file.shows
    .filter((s) => ALL || staleness(s, now) >= STALE_DAYS)
    .sort((a, b) => staleness(b, now) - staleness(a, now))
    .slice(0, ALL ? undefined : LIMIT);

  console.log(`Refreshing ${queue.length} of ${file.shows.length} shows.`);
  let matched = 0;
  let unmatched = 0;
  let failed = 0;

  await mapLimit(queue, 8, async (show) => {
    try {
      if (!show.tmdbId) {
        const hit = bestMatch(show.title, await tmdb.search(show.title));
        if (!hit) {
          // Leave it alone; a human can paste the right TMDB id in the app.
          show.providersUpdated = new Date(now).toISOString();
          unmatched++;
          return;
        }
        show.tmdbId = hit.id;
        show.poster = hit.poster_path ?? null;
        matched++;
      }

      const [details, providers] = await Promise.all([
        tmdb.details(show.tmdbId),
        tmdb.providers(show.tmdbId),
      ]);

      show.status = toReturningStatus(details);
      show.nextAirDate = details.next_episode_to_air?.air_date ?? null;
      show.runtime = show.runtime ?? toRuntime(details);
      show.format = toFormat(details, show.format);
      show.seasons = toSeasons(details, show.seasons);
      show.providers = toProviders(providers);
      show.poster = show.poster ?? details.poster_path ?? null;
      show.providersUpdated = new Date(now).toISOString();
    } catch (e) {
      failed++;
      console.warn(`  ${show.title}: ${e.message}`);
    }
  });

  writeFileSync(SHOWS, `${JSON.stringify(file, null, 1)}\n`);
  console.log(`Newly matched ${matched}, no TMDB match ${unmatched}, errors ${failed}.`);
}

await main();
