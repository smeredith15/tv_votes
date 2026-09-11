import { watchState } from "./ledgers";
import type { Dataset, Draw, LedgerId, PersonId } from "./types";

export interface PersonStats {
  person: PersonId;
  /**
   * How much of the winners' tickets were theirs, summed over every draw.
   * One draw where they backed the whole winner counts as a full win; a draw
   * they split evenly counts as half each.
   */
  winShare: number;
  /** Their share of all the points riding on those draws. */
  spendShare: number;
  /** Draws where they had at least one point on the winner. */
  backedWinner: number;
  /** Draws where they had nothing on the winner at all. */
  shutOut: number;
}

/**
 * Who is actually getting what they wanted.
 *
 * Counting wins per person is meaningless when both of you back the same show,
 * so credit is split by how much of the winner's tickets each of you paid for.
 * Comparing that against your share of the points spent says whether someone is
 * running hot or cold — over a handful of draws it is mostly luck, which is the
 * point of showing both numbers side by side.
 */
export function personStats(history: Draw[], people: PersonId[], ledger?: LedgerId): PersonStats[] {
  const draws = ledger ? history.filter((d) => d.ledger === ledger) : history;

  return people.map((person) => {
    let winShare = 0;
    let spent = 0;
    let backedWinner = 0;

    for (const draw of draws) {
      const mine = draw.allocations[person] ?? {};
      const onWinner = mine[draw.winnerId] ?? 0;
      const winnerWeight = draw.standings.find((s) => s.id === draw.winnerId)?.weight ?? 0;

      if (winnerWeight > 0) winShare += onWinner / winnerWeight;
      if (onWinner > 0) backedWinner += 1;
      spent += Object.values(mine).reduce((a, b) => a + b, 0);
    }

    const totalSpent = draws.reduce(
      (sum, draw) =>
        sum +
        people.reduce(
          (inner, p) => inner + Object.values(draw.allocations[p] ?? {}).reduce((a, b) => a + b, 0),
          0,
        ),
      0,
    );

    return {
      person,
      winShare,
      spendShare: totalSpent > 0 ? (spent / totalSpent) * draws.length : 0,
      backedWinner,
      shutOut: draws.length - backedWinner,
    };
  });
}

export interface WatchTotals {
  showsFinished: number;
  showsInProgress: number;
  seasonsWatched: number;
  episodesWatched: number;
  universeItemsWatched: number;
}

/** How much television this has actually amounted to. */
export function watchTotals(data: Dataset): WatchTotals {
  let seasonsWatched = 0;
  let episodesWatched = 0;
  let showsFinished = 0;
  let showsInProgress = 0;

  for (const show of data.shows) {
    const state = watchState(show);
    if (state === "complete") showsFinished += 1;
    if (state === "in_progress") showsInProgress += 1;
    for (const season of show.seasons) {
      if (!season.watched) continue;
      seasonsWatched += 1;
      episodesWatched += season.episodes;
    }
  }

  return {
    showsFinished,
    showsInProgress,
    seasonsWatched,
    episodesWatched,
    universeItemsWatched: data.universes.reduce(
      (sum, u) => sum + u.order.filter((i) => i.watched).length,
      0,
    ),
  };
}

/** Draws per ballot, for the summary row. */
export function drawsByLedger(history: Draw[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const draw of history) counts[draw.ledger] = (counts[draw.ledger] ?? 0) + 1;
  return counts;
}

/**
 * The longest a show has gone on the ballot without ever winning, measured in
 * draws it took part in.
 */
export function longestDrought(history: Draw[]): { title: string; draws: number } | null {
  const appearances = new Map<string, { title: string; draws: number; won: boolean }>();
  for (const draw of history) {
    for (const entry of draw.standings) {
      const record = appearances.get(entry.id) ?? { title: entry.title, draws: 0, won: false };
      record.draws += 1;
      if (entry.id === draw.winnerId) record.won = true;
      appearances.set(entry.id, record);
    }
  }

  const waiting = [...appearances.values()].filter((r) => !r.won).sort((a, b) => b.draws - a.draws);
  return waiting.length > 0 ? { title: waiting[0].title, draws: waiting[0].draws } : null;
}
