import type { Season, Show } from "./types";

/**
 * Counting a run in episodes rather than seasons.
 *
 * A weekly show is watched to the end at a fixed rate, so "where should we be
 * tonight" is a question about episodes, and seasons are too coarse to answer
 * it. Positions are a flat count from the first episode of the first season,
 * which makes the arithmetic plain and converts back to a season and episode
 * on the way out.
 */
export interface Position {
  season: number;
  episode: number;
}

export function totalEpisodes(show: Show): number {
  return show.seasons.reduce((sum, season) => sum + season.episodes, 0);
}

/** Episodes accounted for by the seasons already ticked off. */
export function episodesFromSeasons(show: Show): number {
  return show.seasons.filter((s) => s.watched).reduce((sum, s) => sum + s.episodes, 0);
}

/** Where a flat count lands. A count of 0 is "about to start the first one". */
export function positionAfter(seasons: Season[], watched: number): Position | null {
  let remaining = watched;
  for (const season of seasons) {
    if (remaining < season.episodes) return { season: season.number, episode: remaining + 1 };
    remaining -= season.episodes;
  }
  return null; // past the end: nothing left to watch
}

export function formatPosition(position: Position | null): string {
  if (!position) return "the end";
  return `S${String(position.season).padStart(2, "0")}E${String(position.episode).padStart(2, "0")}`;
}

/**
 * Which seasons a flat count has finished.
 *
 * The episode cursor and the season ticks have to agree, so moving one moves
 * the other; a run watched in order makes that a straight translation.
 */
export function seasonsCovered(seasons: Season[], watched: number): number[] {
  const done: number[] = [];
  let running = 0;
  for (const season of seasons) {
    running += season.episodes;
    if (watched >= running) done.push(season.number);
  }
  return done;
}

/** Episodes a sitting delivers: two half-hours, or one hour. */
export function perSitting(show: Show): number {
  return show.runtime === 30 ? 2 : 1;
}

export interface Pace {
  /** Sittings that should have happened, the first week included. */
  sittings: number;
  /** Where the schedule says you should be, as a flat count. */
  target: number;
  /** Negative when behind, positive when ahead. */
  episodesAhead: number;
}

/**
 * How the run is going against the calendar.
 *
 * The start date counts as the first sitting, and a long weekend is an extra
 * one: the allotment doubles that week, which is the same as having sat down
 * one more time.
 */
export function pace(
  show: Show,
  options: { startedOn: string; startEpisode: number; longWeekends: number; watched: number },
  today = new Date(),
): Pace | null {
  const start = new Date(`${options.startedOn}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;

  const days = Math.floor((startOfDay(today).getTime() - start.getTime()) / 86400000);
  if (days < 0) return { sittings: 0, target: options.startEpisode, episodesAhead: options.watched - options.startEpisode };

  const sittings = Math.floor(days / 7) + 1;
  const scheduled = options.startEpisode + perSitting(show) * (sittings + Math.max(0, options.longWeekends));
  // Never ask for more than the show has.
  const target = Math.min(scheduled, totalEpisodes(show));

  return { sittings, target, episodesAhead: options.watched - target };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
