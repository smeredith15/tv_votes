import { guideFor, today } from "./episodes";
import type { Op } from "./ops";
import type { EpisodeGuide, GuideEpisode, Show } from "./types";

/**
 * Filling in episode titles and air dates for a show being watched.
 *
 * Only a handful of shows are ever in play at once, so these are fetched for
 * those and nobody else. The same rules serve the nightly job and the button
 * in the app, which matters: whichever ran last, the other should agree about
 * what still needs asking for.
 */

/** A season whose last episode landed this recently may still be growing. */
const SETTLING_DAYS = 7;

/**
 * Which seasons are worth asking TMDB about.
 *
 * A season already held and long finished never changes, so it is left alone.
 * One still going out is asked for again, because next week's episode is not
 * in the copy we hold. Seasons before where you are watching are skipped:
 * their titles are no use once they are behind you.
 */
export function seasonsToFetch(
  show: Show,
  guide: EpisodeGuide | undefined,
  options: { from?: number; stamp?: string } = {},
): number[] {
  const stamp = options.stamp ?? today();
  const settled = shift(stamp, -SETTLING_DAYS);

  return show.seasons
    .filter((season) => season.number >= (options.from ?? 0))
    .filter((season) => {
      const held = guideFor(guide, show.id, season.number);
      if (held.length === 0) return true;
      // Short of what the season says it holds: the rest has yet to be listed.
      if (held.length < season.episodes) return true;
      const last = held[held.length - 1];
      return !last.airDate || last.airDate > settled;
    })
    .map((season) => season.number);
}

/** The TMDB calls this needs, which both the app and the nightly job have. */
interface SeasonSource {
  season(id: number, number: number): Promise<unknown>;
}

/**
 * Fetch those seasons, as ops.
 *
 * Ops rather than a written file: in the app these queue up with everything
 * else and go to the repo on the next save, and the nightly job applies the
 * same ones to the file it writes.
 */
export async function fetchGuide(
  tmdb: SeasonSource,
  show: Show,
  seasons: number[],
  toGuide: (season: unknown) => GuideEpisode[],
  at = new Date().toISOString(),
): Promise<Op[]> {
  if (!show.tmdbId) return [];
  const id = show.tmdbId;

  const failures: unknown[] = [];
  const fetched = await Promise.all(
    seasons.map(async (season): Promise<[number, GuideEpisode[]]> => {
      try {
        return [season, toGuide(await tmdb.season(id, season))];
      } catch (e) {
        // One season missing from TMDB is no reason to lose the others.
        failures.push(e);
        return [season, []];
      }
    }),
  );

  const ops = fetched
    .filter(([, episodes]) => episodes.length > 0)
    .map(([season, episodes]): Op => ({ type: "guide", showId: show.id, season, at, episodes }));

  // Nothing came back and something went wrong: that is the bad key or the
  // missing network saying so, and it should be read rather than swallowed.
  if (ops.length === 0 && failures.length > 0) throw failures[0];
  return ops;
}

/** Move a YYYY-MM-DD stamp by whole days, staying in that same form. */
function shift(stamp: string, days: number): string {
  const date = new Date(`${stamp}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
