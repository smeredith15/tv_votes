import type { Dataset, LedgerId, Show } from "../src/lib/types";

const LEDGERS: LedgerId[] = ["weekly", "hour", "half", "mini"];

export function makeShow(partial: Partial<Show> & { id: string }): Show {
  return {
    title: partial.id,
    runtime: 60,
    format: "series",
    franchise: null,
    universe: null,
    status: "unknown",
    tmdbId: null,
    providers: [],
    seasons: [],
    votes: Object.fromEntries(LEDGERS.map((l) => [l, { scotty: 0, shelby: 0 }])) as Show["votes"],
    ...partial,
  };
}

export function seasons(count: number, watched = 0) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    episodes: 10,
    watched: i < watched,
  }));
}

export function makeData(shows: Show[]): Dataset {
  return {
    people: ["scotty", "shelby"],
    budgets: { weekly: 1500, hour: 750, half: 1000, mini: 500 },
    shows,
    universes: [],
    history: [],
    inbox: [],
  };
}
