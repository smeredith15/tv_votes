import type { Dataset, LedgerId, Show, WatchState } from "./types";

export const LEDGERS: { id: LedgerId; name: string; blurb: string }[] = [
  { id: "half", name: "Half-hour", blurb: "One series at a time, start to finish" },
  { id: "hour", name: "Hour-long", blurb: "One season at a time" },
  { id: "weekly", name: "Weekly", blurb: "Friday nights — 2 episodes if half-hour, 1 if hour" },
  { id: "mini", name: "Mini / anthology", blurb: "One season at a time" },
];

/** A half-hour series this long or longer is split in half rather than binged whole. */
export const LONG_SERIES_SEASONS = 6;

export const ONE_SEASON_FORMATS = new Set(["mini", "anthology", "documentary", "limited"]);

export function watchState(show: Show): WatchState {
  if (show.seasons.length === 0) return "unwatched";
  const watched = show.seasons.filter((s) => s.watched).length;
  if (watched === 0) return "unwatched";
  return watched === show.seasons.length ? "complete" : "in_progress";
}

/**
 * Nothing left to watch of what has aired.
 *
 * Not the same as finished: a show can be caught up and still coming back.
 * Either way there is nothing to vote for today, and when a new season lands
 * the refresh adds it unwatched and the show is votable again — or picks itself
 * back up, if it is set to.
 */
export function caughtUp(show: Show): boolean {
  return show.seasons.length > 0 && show.seasons.every((season) => season.watched);
}

export function unwatchedSeasons(show: Show): number[] {
  return show.seasons.filter((s) => !s.watched).map((s) => s.number);
}

/**
 * Which ballots a show belongs on, derived from its runtime and format.
 *
 * This replaces the workbook's four hand-maintained sheets, which had drifted
 * apart: the same show could sit on one sheet and be missing from another.
 */
export function eligibleLedgers(show: Show): LedgerId[] {
  const ledgers: LedgerId[] = [];
  // A show watched inside a universe is voted on under the universe's own entry.
  if (show.universe && !show.universeEntry) return ledgers;
  if (caughtUp(show)) return ledgers;
  // Set to pick itself back up when a season lands, so there is nothing to vote on.
  if (show.autoResume) return ledgers;

  ledgers.push("weekly");
  // A universe spans both runtimes and never ends, so it sits on the long ballots.
  if (show.universeEntry) return ["weekly", "hour"].filter((l) => !show.exclude?.includes(l as LedgerId)) as LedgerId[];
  if (show.runtime === 60) ledgers.push("hour");
  if (show.runtime === 30) ledgers.push("half");
  if (ONE_SEASON_FORMATS.has(show.format)) ledgers.push("mini");

  return ledgers.filter((l) => !show.exclude?.includes(l));
}

export function isEligible(show: Show, ledger: LedgerId): boolean {
  return eligibleLedgers(show).includes(ledger);
}

export interface Ballot {
  /** Season numbers this vote would commit you to. Empty means the whole show. */
  seasons: number[];
  label: string;
}

/**
 * What you are actually voting for when you back a show on a given ballot.
 *
 * Hour-long and mini/anthology shows go one season at a time. Half-hour shows
 * go start to finish, unless the series runs long, in which case it splits in
 * half so it does not eat the whole rotation.
 */
export function ballotFor(show: Show, ledger: LedgerId): Ballot {
  const remaining = unwatchedSeasons(show);
  if (remaining.length === 0) {
    return { seasons: [], label: show.seasons.length ? "Fully watched" : "Seasons unknown" };
  }

  const oneAtATime = ledger === "mini" || ONE_SEASON_FORMATS.has(show.format) || show.runtime === 60;
  if (oneAtATime) {
    const next = remaining[0];
    return { seasons: [next], label: `Season ${next}` };
  }

  // Half-hour series: the whole run, or one half of it when the run is long.
  // The halves are fixed by the full season count, so finishing the first half
  // puts the entire back half on the ballot rather than a quarter of it.
  if (show.seasons.length >= LONG_SERIES_SEASONS) {
    const split = Math.ceil(show.seasons.length / 2);
    const inFirstHalf = remaining[0] <= split;
    const half = remaining.filter((n) => (inFirstHalf ? n <= split : n > split));
    return {
      seasons: half,
      label: half.length === 1 ? `Season ${half[0]}` : `Seasons ${half[0]}–${half[half.length - 1]}`,
    };
  }
  return {
    seasons: remaining,
    label: remaining.length === show.seasons.length ? "Whole series" : `Seasons ${remaining[0]}–${remaining[remaining.length - 1]}`,
  };
}

/** Episodes per sitting, for the Friday-night ledger. */
export function episodesPerWeek(show: Show): number {
  return show.runtime === 30 ? 2 : 1;
}

/** Every point committed on this ballot, whether or not it can still win. */
export function totalSpent(data: Dataset, ledger: LedgerId, person: string): number {
  return data.shows.reduce((sum, show) => sum + (show.votes[ledger]?.[person] ?? 0), 0);
}

/**
 * Points that can actually win something: the ones the draw counts.
 *
 * The workbook had no notion of a show dropping off, so its total and this
 * were the same number. Here a finished show stops being drawable while its
 * points sit there, and it is this figure, not the raw total, that says how
 * much pull each of you really has.
 */
export function effectiveSpent(data: Dataset, ledger: LedgerId, person: string): number {
  return data.shows
    .filter((show) => isEligible(show, ledger))
    .reduce((sum, show) => sum + (show.votes[ledger]?.[person] ?? 0), 0);
}

/**
 * Points sitting on shows that can no longer win — finished series, or shows
 * now watched inside a universe. The workbook counted these toward your total
 * without saying so, which quietly shrank your real influence on a draw.
 */
export function strandedPoints(data: Dataset, ledger: LedgerId, person: string): number {
  return data.shows
    .filter((show) => !isEligible(show, ledger))
    .reduce((sum, show) => sum + (show.votes[ledger]?.[person] ?? 0), 0);
}

/**
 * The workbook's "cheater" check: nobody may outspend the other.
 *
 * Measured on what the draw will actually use. Comparing raw totals would call
 * a ballot fair while one of you quietly had less say, because some of their
 * points were parked on a show that had finished.
 */
export function ledgerBalanced(data: Dataset, ledger: LedgerId): boolean {
  const spends = data.people.map((p) => effectiveSpent(data, ledger, p));
  return spends.every((s) => s === spends[0]);
}

/** Shows holding points on this ballot that can no longer win them anything. */
export function strandedShows(data: Dataset, ledger: LedgerId): Show[] {
  return data.shows.filter(
    (show) =>
      !isEligible(show, ledger) && data.people.some((p) => (show.votes[ledger]?.[p] ?? 0) > 0),
  );
}
