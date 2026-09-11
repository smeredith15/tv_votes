import type { Dataset, Draw, InboxItem, LedgerId, Show } from "./types";

/**
 * Every change is recorded as an operation rather than applied to a snapshot.
 *
 * Two people vote from two devices against one JSON file in the repo. Replaying
 * operations onto whatever the repo currently holds means a vote saved from the
 * couch does not wipe out one saved from the kitchen a minute earlier.
 */
export type Op =
  | { type: "vote"; showId: string; ledger: LedgerId; person: string; points: number }
  | { type: "season"; showId: string; season: number; watched: boolean }
  | { type: "field"; showId: string; patch: Partial<Show> }
  | { type: "addShow"; show: Show }
  | { type: "removeShow"; showId: string }
  | { type: "draw"; draw: Draw }
  | { type: "universeItem"; universeId: string; index: number; watched: boolean }
  | { type: "inbox"; tmdbId: number; accept: boolean; show?: Show }
  | { type: "inboxSuggest"; item: InboxItem }
  | { type: "budget"; ledger: LedgerId; points: number };

function findShow(data: Dataset, id: string): Show | undefined {
  return data.shows.find((s) => s.id === id);
}

export function applyOp(data: Dataset, op: Op): Dataset {
  switch (op.type) {
    case "vote": {
      const show = findShow(data, op.showId);
      if (show) {
        show.votes[op.ledger] = { ...show.votes[op.ledger], [op.person]: Math.max(0, op.points) };
      }
      return data;
    }
    case "season": {
      const season = findShow(data, op.showId)?.seasons.find((s) => s.number === op.season);
      if (season) season.watched = op.watched;
      return data;
    }
    case "field": {
      const show = findShow(data, op.showId);
      if (show) Object.assign(show, op.patch);
      return data;
    }
    case "addShow": {
      if (!findShow(data, op.show.id)) data.shows.push(op.show);
      return data;
    }
    case "removeShow": {
      data.shows = data.shows.filter((s) => s.id !== op.showId);
      return data;
    }
    case "draw": {
      if (!data.history.some((d) => d.id === op.draw.id)) data.history.push(op.draw);
      return data;
    }
    case "universeItem": {
      const item = data.universes.find((u) => u.id === op.universeId)?.order[op.index];
      if (item) item.watched = op.watched;
      return data;
    }
    case "inbox": {
      data.inbox = data.inbox.filter((i) => i.tmdbId !== op.tmdbId);
      if (op.accept && op.show && !findShow(data, op.show.id)) data.shows.push(op.show);
      return data;
    }
    case "inboxSuggest": {
      const known = data.shows.some((s) => s.tmdbId === op.item.tmdbId);
      const queued = data.inbox.some((i) => i.tmdbId === op.item.tmdbId);
      if (!known && !queued) data.inbox.push(op.item);
      return data;
    }
    case "budget": {
      data.budgets = { ...data.budgets, [op.ledger]: op.points };
      return data;
    }
  }
}

export function applyOps(data: Dataset, ops: Op[]): Dataset {
  return ops.reduce(applyOp, data);
}

/** Collapse repeat edits to the same target so a sync sends one change, not ten. */
export function compact(ops: Op[]): Op[] {
  const keyed = new Map<string, Op>();
  const rest: Op[] = [];
  for (const op of ops) {
    let key: string | null = null;
    if (op.type === "vote") key = `vote:${op.showId}:${op.ledger}:${op.person}`;
    else if (op.type === "season") key = `season:${op.showId}:${op.season}`;
    else if (op.type === "universeItem") key = `uni:${op.universeId}:${op.index}`;
    else if (op.type === "budget") key = `budget:${op.ledger}`;

    if (key) keyed.set(key, op);
    else rest.push(op);
  }
  return [...rest, ...keyed.values()];
}
