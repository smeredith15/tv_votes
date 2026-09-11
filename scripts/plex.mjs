/**
 * Record which seasons are on the Plex server.
 *
 * This one runs on your machine, not in CI: the nightly job runs on GitHub's
 * runners, which cannot reach a server on your home network. It reads the
 * library, matches it against the show list, and writes data/plex.json for you
 * to commit.
 *
 *   PLEX_URL=http://192.168.1.10:32400 PLEX_TOKEN=xxxx npm run plex
 *
 * The token is the X-Plex-Token on any request the Plex web app makes; it is
 * only ever sent to your own server, and is not stored in the repo.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { matchKey } from "./tmdb.mjs";

const SHOWS = "data/shows.json";
const PLEX = "data/plex.json";

const DRY_RUN = process.argv.includes("--dry-run");

async function plexGet(url, token, path) {
  const res = await fetch(`${url}${path}`, {
    headers: { "X-Plex-Token": token, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Plex ${res.status} on ${path}`);
  return res.json();
}

/** Every TV section in the library — a server can have more than one. */
async function tvSections(url, token) {
  const body = await plexGet(url, token, "/library/sections");
  return (body.MediaContainer?.Directory ?? []).filter((d) => d.type === "show");
}

async function seriesIn(url, token, sectionKey) {
  const body = await plexGet(url, token, `/library/sections/${sectionKey}/all?type=2`);
  return body.MediaContainer?.Metadata ?? [];
}

/** Season numbers in a children listing, ignoring specials and oddities. */
export function seasonNumbers(metadata = []) {
  return [...new Set(metadata.map((s) => s.index).filter((n) => Number.isInteger(n) && n > 0))].sort(
    (a, b) => a - b,
  );
}

async function seasonsOf(url, token, ratingKey) {
  const body = await plexGet(url, token, `/library/metadata/${ratingKey}/children`);
  return seasonNumbers(body.MediaContainer?.Metadata ?? []);
}

/** Plex stores a tmdb:// guid when the agent matched it; that beats a title. */
export function tmdbIdOf(entry) {
  for (const guid of entry.Guid ?? []) {
    const found = /^tmdb:\/\/(\d+)$/.exec(guid.id ?? "");
    if (found) return Number(found[1]);
  }
  return null;
}

/**
 * Tie a Plex entry to a show on the ledger. The TMDB id Plex recorded is
 * authoritative; the title is the fallback for anything Plex matched by hand
 * or with a different agent.
 */
export function matchShow(entry, byTmdb, byTitle) {
  return byTmdb.get(tmdbIdOf(entry)) ?? byTitle.get(matchKey(entry.title)) ?? null;
}

/** Index the ledger both ways, ready for matching. */
export function indexShows(shows) {
  return {
    byTmdb: new Map(shows.filter((s) => s.tmdbId).map((s) => [s.tmdbId, s])),
    byTitle: new Map(shows.map((s) => [matchKey(s.title), s])),
  };
}

async function main() {
  const url = (process.env.PLEX_URL ?? "").replace(/\/$/, "");
  const token = process.env.PLEX_TOKEN;
  if (!url || !token) throw new Error("Set PLEX_URL and PLEX_TOKEN.");

  const { byTmdb, byTitle } = indexShows(JSON.parse(readFileSync(SHOWS, "utf8")).shows);

  const library = {};
  let matched = 0;
  const unmatched = [];

  for (const section of await tvSections(url, token)) {
    for (const entry of await seriesIn(url, token, section.key)) {
      const show = matchShow(entry, byTmdb, byTitle);
      if (!show) {
        unmatched.push(entry.title);
        continue;
      }
      const seasons = await seasonsOf(url, token, entry.ratingKey);
      if (seasons.length === 0) continue;
      // A show can appear in more than one section; take the union.
      library[show.id] = [...new Set([...(library[show.id] ?? []), ...seasons])].sort((a, b) => a - b);
      matched++;
    }
  }

  const out = { updatedAt: new Date().toISOString(), shows: library };
  if (DRY_RUN) {
    console.log(JSON.stringify(out, null, 1));
  } else {
    writeFileSync(PLEX, `${JSON.stringify(out, null, 1)}\n`);
  }

  console.log(`Matched ${matched} shows on Plex.`);
  if (unmatched.length) {
    console.log(`Not on the ledger (${unmatched.length}): ${unmatched.slice(0, 10).join(", ")}`);
    console.log("Add any you want to vote on through the app, then run this again.");
  }
  if (!DRY_RUN) console.log(`Wrote ${PLEX} — commit it to share with the other of you.`);
}

// Only when run directly, so the helpers above can be imported and tested.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main();
