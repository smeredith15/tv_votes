import { useCallback, useEffect, useMemo, useState } from "react";
import { ConflictError, type RepoConfig, readFile, writeFile } from "./github";
import { applyOps, compact, type Op } from "./ops";
import type { Dataset, Draw, InboxItem, Universe } from "./types";

const SETTINGS_KEY = "tv-votes.settings";
const PENDING_KEY = "tv-votes.pending";

export interface Settings {
  repo: RepoConfig;
  /** Which of you is sitting at this device. */
  me: string;
  /** Keep your partner's points hidden until you have both locked in. */
  sealed: boolean;
  tmdbKey: string;
  region: string;
}

export const DEFAULT_SETTINGS: Settings = {
  repo: { owner: "smeredith15", repo: "tv_votes", branch: "main", token: "" },
  me: "scotty",
  sealed: false,
  tmdbKey: "",
  region: "US",
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings(): Settings {
  const stored = load<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  return { ...stored, repo: { ...DEFAULT_SETTINGS.repo, ...stored.repo } };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Which repo file each kind of change lands in. */
const FILES = {
  shows: "data/shows.json",
  universes: "data/universes.json",
  history: "data/history.json",
  inbox: "data/inbox.json",
} as const;

type FileKey = keyof typeof FILES;

function filesTouched(ops: Op[]): Set<FileKey> {
  const files = new Set<FileKey>();
  for (const op of ops) {
    if (op.type === "draw") files.add("history");
    else if (op.type === "universeItem") files.add("universes");
    else if (op.type === "inboxSuggest") files.add("inbox");
    else if (op.type === "inbox") {
      files.add("inbox");
      if (op.accept) files.add("shows");
    } else files.add("shows");
  }
  return files;
}

interface ShowsFile {
  people: string[];
  displayNames?: Record<string, string>;
  budgets: Dataset["budgets"];
  shows: Dataset["shows"];
}

/** Read the four ledger files straight off the published site — no token needed. */
async function fetchPublished(base: string): Promise<Dataset> {
  const [shows, universes, history, inbox] = await Promise.all([
    fetch(`${base}data/shows.json`).then((r) => r.json() as Promise<ShowsFile>),
    fetch(`${base}data/universes.json`).then((r) => r.json() as Promise<Universe[]>),
    fetch(`${base}data/history.json`).then((r) => r.json() as Promise<Draw[]>),
    fetch(`${base}data/inbox.json`).then((r) => r.json() as Promise<InboxItem[]>),
  ]);
  return { ...shows, universes, history, inbox };
}

/**
 * Read from the repo itself when we have a token. The published copy only
 * refreshes when Pages redeploys, so a vote saved a moment ago would otherwise
 * seem to vanish — and the other person's votes would show up a build late.
 */
async function fetchFromRepo(repo: RepoConfig): Promise<Dataset> {
  const [shows, universes, history, inbox] = await Promise.all([
    readFile<ShowsFile>(repo, FILES.shows),
    readFile<Universe[]>(repo, FILES.universes),
    readFile<Draw[]>(repo, FILES.history),
    readFile<InboxItem[]>(repo, FILES.inbox),
  ]);
  return { ...shows.data, universes: universes.data, history: history.data, inbox: inbox.data };
}

export interface Store {
  data: Dataset | null;
  settings: Settings;
  setSettings: (settings: Settings) => void;
  /** Queue a change: applied on screen at once, pushed to the repo on sync. */
  dispatch: (...ops: Op[]) => void;
  pending: number;
  sync: () => Promise<void>;
  syncing: boolean;
  error: string | null;
  /** No ledgers are reachable without a token — show the setup panel. */
  needsToken: boolean;
  reload: () => Promise<void>;
}

export function useStore(baseUrl: string): Store {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [base, setBase] = useState<Dataset | null>(null);
  const [pending, setPending] = useState<Op[]>(() => load<Op[]>(PENDING_KEY, []));
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsToken, setNeedsToken] = useState(false);

  const { repo } = settings;
  const reload = useCallback(async () => {
    try {
      setBase(repo.token ? await fetchFromRepo(repo) : await fetchPublished(baseUrl));
      setError(null);
      setNeedsToken(false);
      return;
    } catch (first) {
      // A bad token should not lock you out of reading the ledgers, so fall
      // back to whatever the site published alongside the app.
      try {
        setBase(await fetchPublished(baseUrl));
        setError(
          repo.token && first instanceof Error
            ? `Reading from GitHub failed (${first.message}); showing the published copy.`
            : null,
        );
        setNeedsToken(false);
      } catch {
        // Nothing published either: this is a public host serving only the app,
        // with the ledgers kept in the private repo. Nothing to show until a
        // token is pasted in.
        setNeedsToken(!repo.token);
        setError(repo.token && first instanceof Error ? first.message : null);
      }
    }
  }, [baseUrl, repo.owner, repo.repo, repo.branch, repo.token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }, [pending]);

  const setSettings = useCallback((next: Settings) => {
    setSettingsState(next);
    saveSettings(next);
  }, []);

  const dispatch = useCallback((...ops: Op[]) => {
    setPending((prev) => compact([...prev, ...ops]));
  }, []);

  // What the screen shows: the published data with your unsaved changes on top.
  const data = useMemo(() => {
    if (!base) return null;
    return applyOps(structuredClone(base), pending);
  }, [base, pending]);

  const sync = useCallback(async () => {
    if (!settings.repo.token) {
      setError("Add a GitHub token in Settings before saving.");
      return;
    }
    const ops = compact(pending);
    if (ops.length === 0) return;

    setSyncing(true);
    setError(null);
    try {
      await push(settings.repo, ops);
      setPending([]);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [pending, reload, settings.repo]);

  return { data, settings, setSettings, dispatch, pending: pending.length, sync, syncing, error, needsToken, reload };
}

/**
 * Replay the queued changes onto whatever the repo holds right now and write
 * each touched file back. A conflict means the other of you saved first, so we
 * re-read and replay rather than overwrite.
 */
async function push(repo: RepoConfig, ops: Op[], attempt = 0): Promise<void> {
  const touched = filesTouched(ops);
  const message = describe(ops);

  for (const key of touched) {
    const current = await readFile<unknown>(repo, FILES[key]);
    const scratch = intoDataset(key, current.data);
    const next = applyOps(scratch, ops);
    try {
      await writeFile(repo, FILES[key], outOfDataset(key, next), current.sha, message);
    } catch (e) {
      if (e instanceof ConflictError && attempt < 2) return push(repo, ops, attempt + 1);
      throw e;
    }
  }
}

/** Wrap a single file in a whole-Dataset shape so the op reducer can run on it. */
function intoDataset(key: FileKey, raw: unknown): Dataset {
  const empty: Dataset = { people: [], budgets: {} as Dataset["budgets"], shows: [], universes: [], history: [], inbox: [] };
  if (key === "shows") return { ...empty, ...(raw as ShowsFile) };
  if (key === "universes") return { ...empty, universes: raw as Universe[] };
  if (key === "history") return { ...empty, history: raw as Draw[] };
  return { ...empty, inbox: raw as InboxItem[] };
}

function outOfDataset(key: FileKey, data: Dataset): unknown {
  if (key === "shows") {
    return { people: data.people, displayNames: data.displayNames, budgets: data.budgets, shows: data.shows };
  }
  if (key === "universes") return data.universes;
  if (key === "history") return data.history;
  return data.inbox;
}

function describe(ops: Op[]): string {
  const draw = ops.find((o) => o.type === "draw");
  if (draw && draw.type === "draw") return `Draw: ${draw.draw.winnerTitle} (${draw.draw.ledger})`;
  const kinds = new Set(ops.map((o) => o.type));
  if (kinds.size === 1 && kinds.has("vote")) return `Update votes (${ops.length})`;
  if (kinds.size === 1 && kinds.has("season")) return `Update watched seasons (${ops.length})`;
  return `Update ledgers (${ops.length} changes)`;
}
