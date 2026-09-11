import type { Op } from "./ops";
import type { Dataset, Draw, InboxItem, Universe } from "./types";

/** Which repo file each kind of change lands in. */
export const FILES = {
  shows: "data/shows.json",
  universes: "data/universes.json",
  history: "data/history.json",
  inbox: "data/inbox.json",
} as const;

export const ALL_FILES = Object.values(FILES);

export interface ShowsFile {
  people: string[];
  displayNames?: Record<string, string>;
  budgets: Dataset["budgets"];
  shows: Dataset["shows"];
}

/** How the JSON files are formatted, matching what the import script writes. */
function format(value: unknown): string {
  return `${JSON.stringify(value, null, 1)}\n`;
}

/** Assemble the four files into the one dataset the app works with. */
export function datasetFrom(files: Record<string, string>): Dataset {
  const shows = JSON.parse(files[FILES.shows]) as ShowsFile;
  return {
    ...shows,
    universes: JSON.parse(files[FILES.universes]) as Universe[],
    history: JSON.parse(files[FILES.history]) as Draw[],
    inbox: JSON.parse(files[FILES.inbox]) as InboxItem[],
  };
}

/** And split it back out, ready to commit. */
export function serialize(data: Dataset): Record<string, string> {
  return {
    [FILES.shows]: format({
      people: data.people,
      displayNames: data.displayNames,
      budgets: data.budgets,
      shows: data.shows,
    }),
    [FILES.universes]: format(data.universes),
    [FILES.history]: format(data.history),
    [FILES.inbox]: format(data.inbox),
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
  if (kinds.size === 1 && kinds.has("vote")) return `Update votes (${ops.length})`;
  if (kinds.size === 1 && kinds.has("season")) return `Update watched seasons (${ops.length})`;
  return `Update ledgers (${ops.length} changes)`;
}
