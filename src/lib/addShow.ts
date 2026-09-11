import { toFormat, toProviders, toReturningStatus, toRuntime, toSeasons } from "../../scripts/tmdb.mjs";
import { slugify } from "./titles";
import type { LedgerId, Show } from "./types";

const LEDGERS: LedgerId[] = ["weekly", "hour", "half", "mini"];

/**
 * The TMDB id in whatever was pasted: the number itself, or a page URL such as
 * themoviedb.org/tv/1396-breaking-bad. Anything else is a title to search for.
 */
export function parseTmdbId(input: string): number | null {
  const text = input.trim();
  if (/^\d+$/.test(text)) return Number(text);

  const url = /themoviedb\.org\/tv\/(\d+)/i.exec(text);
  if (url) return Number(url[1]);

  return null;
}

/** An id nothing else is using, so a second "The Office" does not collide. */
export function uniqueId(title: string, year: string | null, taken: Set<string>): string {
  const base = slugify(title) || "show";
  if (!taken.has(base)) return base;

  const withYear = year ? `${base}-${year}` : base;
  if (!taken.has(withYear)) return withYear;

  for (let n = 2; ; n++) {
    const candidate = `${withYear}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface TmdbDetails {
  id: number;
  name: string;
  first_air_date?: string;
  poster_path?: string | null;
  next_episode_to_air?: { air_date?: string } | null;
}

/**
 * Build a show from what TMDB knows, ready to drop on the list.
 *
 * Everything the nightly refresh would fill in is filled in here, so a show
 * added by hand is on the right ballots straight away rather than sitting on
 * the weekly one until the next run.
 */
export function showFromTmdb(
  details: TmdbDetails,
  providers: unknown,
  options: { people: string[]; taken: Set<string>; watched: boolean },
): Show {
  const year = details.first_air_date?.slice(0, 4) ?? null;
  const seasons = toSeasons(details, []).map((season) => ({ ...season, watched: options.watched }));

  return {
    id: uniqueId(details.name, year, options.taken),
    title: details.name,
    runtime: toRuntime(details),
    format: toFormat(details, "series"),
    franchise: null,
    universe: null,
    status: toReturningStatus(details),
    nextAirDate: details.next_episode_to_air?.air_date ?? null,
    tmdbId: details.id,
    poster: details.poster_path ?? null,
    providers: toProviders(providers),
    providersUpdated: new Date().toISOString(),
    seasons,
    votes: Object.fromEntries(
      LEDGERS.map((l) => [l, Object.fromEntries(options.people.map((p) => [p, 0]))]),
    ) as Show["votes"],
    addedAt: new Date().toISOString(),
  };
}
