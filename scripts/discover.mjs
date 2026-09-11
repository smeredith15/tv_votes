/**
 * Queue newly premiered shows for approval. Nothing reaches a ballot without
 * someone saying yes in the app's inbox — the point is to stop new shows being
 * missed, not to fill the list with every reality series that airs.
 *
 *   node scripts/discover.mjs [--days 14] [--max 25]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient, toRuntime } from "./tmdb.mjs";

const SHOWS = "data/shows.json";
const INBOX = "data/inbox.json";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
}

const DAYS = arg("days", 14);
const MAX = arg("max", 25);

/** Genres you would never sit down for, so they never reach the inbox. */
const SKIP_GENRES = new Set([10764 /* reality */, 10767 /* talk */, 10763 /* news */, 10762 /* kids */]);

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("Set TMDB_API_KEY.");
  const tmdb = createClient({ key, region: process.env.TMDB_REGION ?? "US" });

  const file = JSON.parse(readFileSync(SHOWS, "utf8"));
  const inbox = JSON.parse(readFileSync(INBOX, "utf8"));
  const known = new Set(file.shows.map((s) => s.tmdbId).filter(Boolean));
  const queued = new Set(inbox.map((i) => i.tmdbId));

  const to = new Date();
  const from = new Date(to.getTime() - DAYS * 86400000);
  const window = [from, to].map((d) => d.toISOString().slice(0, 10));

  const found = [];
  for (let page = 1; page <= 3 && found.length < MAX; page++) {
    const { results = [], total_pages = 1 } = await tmdb.discover(window[0], window[1], page);
    for (const hit of results) {
      if (known.has(hit.id) || queued.has(hit.id)) continue;
      if ((hit.genre_ids ?? []).some((g) => SKIP_GENRES.has(g))) continue;
      if ((hit.vote_count ?? 0) < 5 && (hit.popularity ?? 0) < 20) continue;
      found.push(hit);
      if (found.length >= MAX) break;
    }
    if (page >= total_pages) break;
  }

  const suggestedAt = new Date().toISOString();
  for (const hit of found) {
    const details = await tmdb.details(hit.id).catch(() => null);
    inbox.push({
      tmdbId: hit.id,
      title: hit.name,
      firstAirDate: hit.first_air_date ?? null,
      overview: hit.overview ?? "",
      poster: hit.poster_path ?? null,
      network: details?.networks?.[0]?.name ?? null,
      runtime: details ? toRuntime(details) : null,
      suggestedAt,
    });
  }

  writeFileSync(INBOX, `${JSON.stringify(inbox, null, 1)}\n`);
  console.log(`Queued ${found.length} new shows for approval (${inbox.length} waiting).`);
}

await main();
