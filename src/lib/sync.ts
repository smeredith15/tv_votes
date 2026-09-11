import type { Op } from "./ops";
import type { Dataset, Draw, InboxItem, PlexLibrary, Universe, Watching } from "./types";

/** Which repo file each kind of change lands in. */
export const FILES = {
  shows: "data/shows.json",
  universes: "data/universes.json",
  history: "data/history.json",
  inbox: "data/inbox.json",
  plex: "data/plex.json",
  watching: "data/watching.json",
} as const;

export const ALL_FILES = Object.values(FILES);

export interface ShowsFile {
  people: string[];
  displayNames?: Record<string, string>;
  shows: Dataset["shows"];
}

/** How the JSON files are formatted, matching what the import script writes. */
function format(value: unknown): string {
  return `${JSON.stringify(value, null, 1)}\n`;
}

export const EMPTY_PLEX: PlexLibrary = { updatedAt: null, shows: {} };
export const EMPTY_WATCHING: Watching = { picks: {}, asides: [] };

/**
 * Assemble the data files into the one dataset the app works with. A file
 * that is not there yet reads as empty, so adding one does not break a repo
 * that predates it.
 */
export function datasetFrom(files: Record<string, string>): Dataset {
  const read = <T,>(path: string, fallback: T): T =>
    files[path] === undefined ? fallback : (JSON.parse(files[path]) as T);

  return {
    ...(JSON.parse(files[FILES.shows]) as ShowsFile),
    universes: read<Universe[]>(FILES.universes, []),
    history: read<Draw[]>(FILES.history, []),
    inbox: read<InboxItem[]>(FILES.inbox, []),
    plex: read<PlexLibrary>(FILES.plex, EMPTY_PLEX),
    watching: read<Watching>(FILES.watching, EMPTY_WATCHING),
  };
}

/** And split it back out, ready to commit. */
export function serialize(data: Dataset): Record<string, string> {
  return {
    [FILES.shows]: format({
      people: data.people,
      displayNames: data.displayNames,
      shows: data.shows,
    }),
    [FILES.universes]: format(data.universes),
    [FILES.history]: format(data.history),
    [FILES.inbox]: format(data.inbox),
    [FILES.plex]: format(data.plex),
    [FILES.watching]: format(data.watching),
  };
}

/** Only the files a save actually altered, so untouched ones stay out of it. */
export function changedFiles(before: Record<string, string>, after: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(after).filter(([path, text]) => text !== before[path]));
}

export function describe(ops: Op[]): string {
  const draw = ops.find((o) => o.type === "draw");
  if (draw && draw.type === "draw") return `Draw: ${draw.draw.winnerTitle} (${draw.draw.ledger})`;

  const accepted = ops.filter((o) => o.type === "inbox" && o.accept).length;
  const dismissed = ops.filter((o) => o.type === "inbox" && !o.accept).length;
  if (accepted + dismissed === ops.length && ops.length > 0) {
    // Say which way the inbox went, so the commit log is readable later.
    const parts = [];
    if (accepted) parts.push(`added ${accepted}`);
    if (dismissed) parts.push(`dismissed ${dismissed}`);
    return `Inbox: ${parts.join(", ")}`;
  }

  const kinds = new Set(ops.map((o) => o.type));
  if (kinds.has("clearHistory")) return "Clear the draw history";
  if (kinds.size === 1 && kinds.has("forgetDraw")) return `Delete ${ops.length} draw${ops.length === 1 ? "" : "s"}`;
  if (kinds.size === 1 && kinds.has("vote")) return `Update votes (${ops.length})`;
  if (kinds.size === 1 && kinds.has("season")) return `Update watched seasons (${ops.length})`;
  if (kinds.size === 1 && kinds.has("plexSeason")) return `Update what is on Plex (${ops.length})`;
  return `Update ledgers (${ops.length} changes)`;
}
