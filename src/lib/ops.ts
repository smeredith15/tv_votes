import { insertionIndex } from "./titles";
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
  | { type: "forgetDraw"; drawId: string }
  | { type: "clearHistory" }
  /** Take back the points on a show, on one ballot or on all of them. */
  | { type: "freePoints"; showId: string; ledger?: LedgerId }
  /** Mark a season as present on, or missing from, the Plex server. */
  | { type: "plexSeason"; showId: string; season: number; present: boolean }
  /** Put a ballot on a show by hand, or clear what it is on. */
  | { type: "setPick"; ledger: LedgerId; showId: string | null }
  /** Add or drop a show from the list watched outside the voting. */
  | { type: "aside"; showId: string; add: boolean }
  /** Forget every refusal, so the suggestions can come round again. */
  | { type: "clearDismissed" };

function findShow(data: Dataset, id: string): Show | undefined {
  return data.shows.find((s) => s.id === id);
}

/**
 * Add a show where it belongs alphabetically. Appending instead would bury it
 * at the end of a thousand-row list, which reads as the add having failed.
 */
function addShow(data: Dataset, show: Show): void {
  if (findShow(data, show.id)) return;
  data.shows.splice(insertionIndex(data.shows.map((s) => s.title), show.title), 0, show);
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
      addShow(data, op.show);
      return data;
    }
    case "removeShow": {
      data.shows = data.shows.filter((s) => s.id !== op.showId);
      return data;
    }
    case "draw": {
      if (!data.history.some((d) => d.id === op.draw.id)) data.history.push(op.draw);
      // Keeping a draw is what puts that ballot on a show.
      data.watching = {
        ...data.watching,
        picks: { ...data.watching.picks, [op.draw.ledger]: op.draw.winnerId },
      };
      return data;
    }
    case "universeItem": {
      const item = data.universes.find((u) => u.id === op.universeId)?.order[op.index];
      if (item) item.watched = op.watched;
      return data;
    }
    case "inbox": {
      data.inbox = data.inbox.filter((i) => i.tmdbId !== op.tmdbId);
      if (op.accept && op.show) addShow(data, op.show);
      // Remember a refusal, or the next nightly run suggests it all over again.
      if (!op.accept && !data.dismissed.includes(op.tmdbId)) {
        data.dismissed = [...data.dismissed, op.tmdbId];
      }
      return data;
    }
    case "inboxSuggest": {
      const known = data.shows.some((s) => s.tmdbId === op.item.tmdbId);
      const queued = data.inbox.some((i) => i.tmdbId === op.item.tmdbId);
      if (!known && !queued && !data.dismissed.includes(op.item.tmdbId)) data.inbox.push(op.item);
      return data;
    }
    case "freePoints": {
      const show = findShow(data, op.showId);
      if (show) {
        const ledgers = op.ledger ? [op.ledger] : (Object.keys(show.votes) as LedgerId[]);
        for (const ledger of ledgers) {
          show.votes[ledger] = Object.fromEntries(
            Object.keys(show.votes[ledger] ?? {}).map((person) => [person, 0]),
          );
        }
      }
      return data;
    }
    case "forgetDraw": {
      data.history = data.history.filter((d) => d.id !== op.drawId);
      return data;
    }
    case "clearDismissed": {
      data.dismissed = [];
      return data;
    }
    case "clearHistory": {
      data.history = [];
      return data;
    }
    case "plexSeason": {
      const present = new Set(data.plex.shows[op.showId] ?? []);
      if (op.present) present.add(op.season);
      else present.delete(op.season);
      const seasons = [...present].sort((a, b) => a - b);
      data.plex = { ...data.plex, shows: { ...data.plex.shows, [op.showId]: seasons } };
      if (seasons.length === 0) delete data.plex.shows[op.showId];
      return data;
    }
    case "setPick": {
      data.watching = { ...data.watching, picks: { ...data.watching.picks, [op.ledger]: op.showId } };
      return data;
    }
    case "aside": {
      const without = data.watching.asides.filter((id) => id !== op.showId);
      data.watching = { ...data.watching, asides: op.add ? [...without, op.showId] : without };
      return data;
    }
  }
}

export function applyOps(data: Dataset, ops: Op[]): Dataset {
  return ops.reduce(applyOp, data);
}

/** Show ids an op will write to, so only those need copying. */
function targets(op: Op): string[] {
  switch (op.type) {
    case "vote":
    case "season":
    case "field":
    case "freePoints":
      return [op.showId];
    case "addShow":
      return [op.show.id];
    case "inbox":
      return op.show ? [op.show.id] : [];
    default:
      return [];
  }
}

/**
 * A copy of the dataset that the ops may safely be applied to, without
 * duplicating the parts they never touch.
 *
 * The whole thing is some 1.6 MB across a thousand shows, and this runs on
 * every click: deep-copying all of it made each tick of a season cost tens of
 * milliseconds before React had drawn anything. Untouched shows keep their
 * identity too, which lets the list skip re-rendering them.
 */
export function cloneForOps(data: Dataset, ops: Op[]): Dataset {
  const touched = new Set(ops.flatMap(targets));
  const universes = new Set(ops.flatMap((op) => (op.type === "universeItem" ? [op.universeId] : [])));

  return {
    ...data,
    shows: data.shows.map((show) =>
      touched.has(show.id)
        ? { ...show, seasons: show.seasons.map((s) => ({ ...s })), votes: structuredClone(show.votes) }
        : show,
    ),
    universes: data.universes.map((universe) =>
      universes.has(universe.id)
        ? { ...universe, order: universe.order.map((item) => ({ ...item })) }
        : universe,
    ),
    history: [...data.history],
    inbox: [...data.inbox],
    dismissed: [...data.dismissed],
    plex: { ...data.plex, shows: { ...data.plex.shows } },
    watching: { picks: { ...data.watching.picks }, asides: [...data.watching.asides] },
  };
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
    else if (op.type === "plexSeason") key = `plex:${op.showId}:${op.season}`;
    else if (op.type === "freePoints") key = `free:${op.showId}:${op.ledger ?? "all"}`;
    else if (op.type === "setPick") key = `pick:${op.ledger}`;
    else if (op.type === "aside") key = `aside:${op.showId}`;

    if (key) keyed.set(key, op);
    else rest.push(op);
  }
  return [...rest, ...keyed.values()];
}
