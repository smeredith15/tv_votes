import { useCallback, useEffect, useMemo, useState } from "react";
import { ConflictError, commitFiles, readRepo, type RepoConfig } from "./github";
import { applyOps, cloneForOps, compact, migrate, type Op } from "./ops";
import { loadList, loadRecord, save } from "./persist";
import { ALL_FILES, changedFiles, datasetFrom, describe, serialize } from "./sync";
import type { Dataset } from "./types";

const SETTINGS_KEY = "tv-votes.settings";
const PENDING_KEY = "tv-votes.pending";

/** Everyone votes from the one computer, so this is whose turn it is now. */
export const EVERYONE = "both";

export interface Settings {
  repo: RepoConfig;
  /**
   * Who is entering points at this moment: one person, or EVERYONE once you
   * are both done and want to see the whole ballot. While it names a person,
   * the other's points and totals stay hidden so neither can counter-bid.
   */
  voter: string;
  tmdbKey: string;
  region: string;
}

export const DEFAULT_SETTINGS: Settings = {
  repo: { owner: "smeredith15", repo: "tv_votes", branch: "main", token: "" },
  voter: EVERYONE,
  tmdbKey: "",
  region: "US",
};

export function loadSettings(): Settings {
  const stored = loadRecord(localStorage, SETTINGS_KEY, DEFAULT_SETTINGS);
  return { ...stored, repo: { ...DEFAULT_SETTINGS.repo, ...stored.repo } };
}

export function saveSettings(settings: Settings): void {
  save(localStorage, SETTINGS_KEY, settings);
}

/** Read the ledger files straight off the published site — no token needed. */
async function fetchPublished(base: string): Promise<Dataset> {
  const text = async (name: string): Promise<string | undefined> => {
    const res = await fetch(`${base}${name}`);
    // A file added after the last deploy simply is not there yet.
    return res.ok ? await res.text() : undefined;
  };
  const contents = await Promise.all(ALL_FILES.map(async (path) => [path, await text(path)] as const));
  return datasetFrom(Object.fromEntries(contents.filter(([, body]) => body !== undefined)) as Record<string, string>);
}

/**
 * Read from the repo itself when we have a token. The published copy only
 * refreshes when Pages redeploys, so a vote saved a moment ago would otherwise
 * seem to vanish — and the other person's votes would show up a build late.
 */
async function fetchFromRepo(repo: RepoConfig): Promise<Dataset> {
  const snapshot = await readRepo(repo, ALL_FILES);
  return datasetFrom(snapshot.files);
}

/** The unsaved queue, with enough history to take back a wrong press. */
interface Queue {
  pending: Op[];
  undo: Op[][];
}

/** Actions remembered. Enough to climb out of a mistake, not a whole session. */
const UNDO_DEPTH = 30;

export interface Store {
  data: Dataset | null;
  settings: Settings;
  setSettings: (settings: Settings) => void;
  /** Queue a change: applied on screen at once, pushed to the repo on sync. */
  dispatch: (...ops: Op[]) => void;
  pending: number;
  /** Take back the last change made, while it is still unsaved. */
  undo: () => void;
  canUndo: boolean;
  /** Drop every unsaved change, leaving what the repo holds. */
  discard: () => void;
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
  const [queue, setQueue] = useState<Queue>(() => ({
    pending: migrate(loadList<Op>(localStorage, PENDING_KEY)),
    undo: [],
  }));
  const pending = queue.pending;
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
    save(localStorage, PENDING_KEY, pending);
  }, [pending]);

  const setSettings = useCallback((next: Settings) => {
    setSettingsState(next);
    saveSettings(next);
  }, []);

  const dispatch = useCallback((...ops: Op[]) => {
    setQueue((current) => ({
      pending: compact([...current.pending, ...ops]),
      // Keep what the queue looked like first, so one wrong press is one press
      // to put right — the queue before the action, whatever the action did.
      undo: [...current.undo, current.pending].slice(-UNDO_DEPTH),
    }));
  }, []);

  const undo = useCallback(() => {
    setQueue((current) =>
      current.undo.length === 0
        ? current
        : { pending: current.undo[current.undo.length - 1], undo: current.undo.slice(0, -1) },
    );
  }, []);

  /** Throw away everything unsaved. The repo is untouched, so this is a reset. */
  const discard = useCallback(() => {
    setQueue((current) => ({ pending: [], undo: [...current.undo, current.pending].slice(-UNDO_DEPTH) }));
  }, []);

  // What the screen shows: the published data with your unsaved changes on top.
  const data = useMemo(() => {
    if (!base) return null;
    return applyOps(cloneForOps(base, pending), pending);
  }, [base, pending]);

  const sync = useCallback(async () => {
    if (!settings.repo.token) {
      setError("Add a GitHub token in Settings before saving.");
      return;
    }
    const ops = compact(pending);
    if (ops.length === 0) return;

    // Hold on to the exact ops being sent: anything ticked while the save is
    // in flight must stay queued rather than be cleared with them.
    const sending = pending;

    setSyncing(true);
    setError(null);
    try {
      const saved = await push(settings.repo, ops);
      // Use what was committed as the new starting point. Re-reading instead
      // would blank the ticks until it came back, and GitHub can serve the
      // previous commit for a moment after a write — which looked exactly like
      // the save not having registered.
      setBase(saved);
      // Saved changes cannot be undone from here; that is what the repo is for.
      setQueue((current) => ({
        pending: current.pending.filter((op) => !sending.includes(op)),
        undo: [],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [pending, settings.repo]);

  return {
    data,
    settings,
    setSettings,
    dispatch,
    pending: pending.length,
    undo,
    canUndo: queue.undo.length > 0,
    discard,
    sync,
    syncing,
    error,
    needsToken,
    reload,
  };
}

/**
 * Replay the queued changes onto whatever the repo holds right now, and commit
 * every file they altered together. A conflict means the other of you saved
 * first, so we re-read and replay rather than overwrite.
 */
/** Attempts before giving up, with a pause between each to let GitHub settle. */
const PUSH_ATTEMPTS = 4;

async function push(repo: RepoConfig, ops: Op[], attempt = 0): Promise<Dataset> {
  const snapshot = await readRepo(repo, ALL_FILES);
  const next = applyOps(datasetFrom(snapshot.files), ops);
  const changed = changedFiles(snapshot.files, serialize(next));
  if (Object.keys(changed).length === 0) return next;

  try {
    await commitFiles(repo, snapshot.headSha, changed, describe(ops));
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e;
    if (attempt + 1 >= PUSH_ATTEMPTS) {
      throw new Error(
        "The branch moved while this was saving, and it kept moving. Nothing has been lost — your " +
          "changes are still queued, so press Save again in a moment.",
      );
    }
    // Back off a little: a branch that has just moved may still be settling.
    await new Promise((done) => setTimeout(done, 300 * 2 ** attempt));
    return push(repo, ops, attempt + 1);
  }
  // What the repo now holds, without having to ask for it back.
  return next;
}
