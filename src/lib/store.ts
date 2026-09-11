import { useCallback, useEffect, useMemo, useState } from "react";
import { ConflictError, commitFiles, readRepo, type RepoConfig } from "./github";
import { applyOps, compact, type Op } from "./ops";
import { loadList, loadRecord, save } from "./persist";
import { ALL_FILES, changedFiles, datasetFrom, describe, serialize, type ShowsFile } from "./sync";
import type { Dataset, Draw, InboxItem, Universe } from "./types";

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
  const snapshot = await readRepo(repo, ALL_FILES);
  return datasetFrom(snapshot.files);
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
  const [pending, setPending] = useState<Op[]>(() => loadList<Op>(localStorage, PENDING_KEY));
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
 * Replay the queued changes onto whatever the repo holds right now, and commit
 * every file they altered together. A conflict means the other of you saved
 * first, so we re-read and replay rather than overwrite.
 */
async function push(repo: RepoConfig, ops: Op[], attempt = 0): Promise<void> {
  const snapshot = await readRepo(repo, ALL_FILES);
  const next = applyOps(datasetFrom(snapshot.files), ops);
  const changed = changedFiles(snapshot.files, serialize(next));
  if (Object.keys(changed).length === 0) return;

  try {
    await commitFiles(repo, snapshot.headSha, changed, describe(ops));
  } catch (e) {
    if (e instanceof ConflictError && attempt < 2) return push(repo, ops, attempt + 1);
    throw e;
  }
}
