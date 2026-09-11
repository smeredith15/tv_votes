import type { Op } from "./ops";
import type { Dataset, Draw, InboxItem, Universe } from "./types";

/** Which repo file each kind of change lands in. */
export const FILES = {
  shows: "data/shows.json",
  universes: "data/universes.json",
  history: "data/history.json",
  inbox: "data/inbox.json",
} as const;

export type FileKey = keyof typeof FILES;

export interface ShowsFile {
  people: string[];
  displayNames?: Record<string, string>;
  budgets: Dataset["budgets"];
  shows: Dataset["shows"];
}

export function filesTouched(ops: Op[]): Set<FileKey> {
  const files = new Set<FileKey>();
  for (const op of ops) {
    if (op.type === "draw") files.add("history");
    else if (op.type === "universeItem") files.add("universes");
    else if (op.type === "inboxSuggest") files.add("inbox");
    else if (op.type === "inbox") {
      files.add("inbox");
      // Accepting a suggestion adds a show, which lives in the other file.
      if (op.accept) files.add("shows");
    } else files.add("shows");
  }
  return files;
}

/** Wrap a single file in a whole-Dataset shape so the op reducer can run on it. */
export function intoDataset(key: FileKey, raw: unknown): Dataset {
  const empty: Dataset = {
    people: [],
    budgets: {} as Dataset["budgets"],
    shows: [],
    universes: [],
    history: [],
    inbox: [],
  };
  if (key === "shows") return { ...empty, ...(raw as ShowsFile) };
  if (key === "universes") return { ...empty, universes: raw as Universe[] };
  if (key === "history") return { ...empty, history: raw as Draw[] };
  return { ...empty, inbox: raw as InboxItem[] };
}

export function outOfDataset(key: FileKey, data: Dataset): unknown {
  if (key === "shows") {
    return { people: data.people, displayNames: data.displayNames, budgets: data.budgets, shows: data.shows };
  }
  if (key === "universes") return data.universes;
  if (key === "history") return data.history;
  return data.inbox;
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
