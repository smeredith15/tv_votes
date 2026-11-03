/**
 * Episode titles and air dates for whatever is being watched.
 *
 * Only the shows on a ballot or on the side: a thousand shows' episodes would
 * be megabytes of JSON to serve the app, and titles are only of use where
 * someone is actually working through a run. The air dates are the other half
 * of it — they are what says which episodes exist to be watched at all, so the
 * app can refuse to mark one that has not gone out.
 *
 *   node scripts/episodes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient, mapLimit, toGuide } from "./tmdb.mjs";

const SHOWS = "data/shows.json";
const WATCHING = "data/watching.json";
const GUIDE = "data/episodes.json";

/** A season whose last episode landed this recently may still be growing. */
const SETTLING_DAYS = 7;

const read = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
};

/** Everything on a ballot or on the side, which is what the app tracks. */
function tracked(watching) {
  const picks = Object.values(watching.picks ?? {}).filter(Boolean);
  return [...new Set([...picks, ...(watching.asides ?? [])])];
}

/** The same rule as the app's: hold what is settled, ask again for what is not. */
function needed(show, held, stamp, settled) {
  return show.seasons
    .filter((season) => {
      const episodes = held?.[season.number] ?? [];
      if (episodes.length === 0 || episodes.length < season.episodes) return true;
      const last = episodes[episodes.length - 1];
      return !last.airDate || last.airDate > settled;
    })
    .map((season) => season.number);
}

function shift(stamp, days) {
  const date = new Date(`${stamp}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("Set TMDB_API_KEY.");
  const tmdb = createClient({ key, region: process.env.TMDB_REGION ?? "US" });

  const file = read(SHOWS, { shows: [] });
  const watching = read(WATCHING, { picks: {}, asides: [] });
  const guide = read(GUIDE, { updatedAt: null, shows: {} });

  const stamp = new Date().toISOString().slice(0, 10);
  const settled = shift(stamp, -SETTLING_DAYS);
  const ids = tracked(watching);
  const shows = file.shows.filter((show) => ids.includes(show.id) && show.tmdbId);

  // Anything no longer being watched drops out, so the file stays the size of
  // what is in play rather than everything that ever was.
  const kept = Object.fromEntries(ids.filter((id) => guide.shows[id]).map((id) => [id, guide.shows[id]]));

  let fetched = 0;
  await mapLimit(shows, 4, async (show) => {
    const held = kept[show.id] ?? {};
    const seasons = needed(show, held, stamp, settled);
    if (seasons.length === 0) return;

    for (const season of seasons) {
      try {
        const episodes = toGuide(await tmdb.season(show.tmdbId, season));
        if (episodes.length > 0) {
          held[season] = episodes;
          fetched++;
        }
      } catch (e) {
        // A season TMDB will not serve is no reason to lose the rest of them.
        console.warn(`  ${show.title} S${season}: ${e.message}`);
      }
    }
    kept[show.id] = held;
  });

  writeFileSync(GUIDE, `${JSON.stringify({ updatedAt: new Date().toISOString(), shows: kept }, null, 1)}\n`);
  console.log(`Episode guide: ${fetched} seasons fetched across ${shows.length} shows being watched.`);
}

await main();
