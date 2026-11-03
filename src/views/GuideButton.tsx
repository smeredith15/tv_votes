import { useState } from "react";
import { createClient, toGuide } from "../../scripts/tmdb.mjs";
import { fetchGuide, seasonsToFetch } from "../lib/guide";
import type { Store } from "../lib/store";
import type { Show } from "../lib/types";

/**
 * Pull episode titles and air dates for a show being watched.
 *
 * The nightly job does this for everything on the go, but it only runs once a
 * day and only for what was being watched when it ran. Picking up a new show
 * on a Friday evening should not mean waiting until morning to see what the
 * next episode is called, or whether it is out yet — so the app can ask TMDB
 * itself, with the key already in Settings.
 */
export function GuideButton({ store, show, from }: { store: Store; show: Show; from?: number }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const key = store.settings.tmdbKey;
  const missing = seasonsToFetch(show, store.data?.guide, { from });
  // Nothing to ask for, nothing to ask with, or nothing to ask about.
  if (!show.tmdbId || !key || missing.length === 0) return null;

  async function load() {
    setBusy(true);
    setNote(null);
    try {
      const tmdb = createClient({ key, region: store.settings.region });
      const ops = await fetchGuide(tmdb, show, missing, toGuide);
      if (ops.length === 0) {
        setNote("TMDB had nothing for those seasons.");
        return;
      }
      store.dispatch(...ops);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="small" onClick={() => void load()} disabled={busy}>
        {busy ? "Asking TMDB…" : "Episode titles"}
      </button>
      {note && <span className="small muted">{note}</span>}
    </>
  );
}
