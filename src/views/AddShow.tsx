import { useState } from "react";
import { IMAGE_BASE, bestMatch, createClient } from "../../scripts/tmdb.mjs";
import type { TmdbSearchResult } from "../../scripts/tmdb.mjs";
import { parseTmdbId, showFromTmdb, type TmdbDetails } from "../lib/addShow";
import type { Store } from "../lib/store";
import type { Dataset, Show } from "../lib/types";

/**
 * Put a show on the list from TMDB.
 *
 * Takes an id, a TMDB page URL, or a title to search for. Everything the
 * nightly refresh would work out — seasons, runtime, streaming, whether it is
 * still going — comes down with it, so the show is on the right ballots at once
 * instead of sitting on the weekly one until the next run.
 */
export function AddShow({ store, data, onAdded }: { store: Store; data: Dataset; onAdded: (id: string) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [watched, setWatched] = useState(false);

  const key = store.settings.tmdbKey;

  async function look() {
    if (!key) {
      setNote("Add your TMDB key in Settings first — this reads from TMDB.");
      return;
    }
    setBusy(true);
    setNote(null);
    setResults([]);
    try {
      const tmdb = createClient({ key, region: store.settings.region });
      const id = parseTmdbId(input);
      if (id !== null) {
        await add(id);
        return;
      }

      const hits = await tmdb.search(input.trim());
      if (hits.length === 0) {
        setNote("TMDB has nothing under that.");
        return;
      }
      // An exact title match goes straight in; otherwise pick from the list.
      const exact = bestMatch(input.trim(), hits);
      setResults(exact ? [exact, ...hits.filter((h) => h.id !== exact.id)].slice(0, 8) : hits.slice(0, 8));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function add(tmdbId: number) {
    const already = data.shows.find((s) => s.tmdbId === tmdbId);
    if (already) {
      setNote(`Already on the list as “${already.title}”.`);
      setResults([]);
      return;
    }

    setBusy(true);
    try {
      const tmdb = createClient({ key, region: store.settings.region });
      const [details, providers] = await Promise.all([tmdb.details(tmdbId), tmdb.providers(tmdbId)]);
      const show: Show = showFromTmdb(details as unknown as TmdbDetails, providers, {
        people: data.people,
        taken: new Set(data.shows.map((s) => s.id)),
        watched,
      });

      store.dispatch({ type: "addShow", show });
      setInput("");
      setResults([]);
      setNote(`Added ${show.title}. Press Save to keep it.`);
      onAdded(show.id);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <strong className="small">Add a show</strong>
      <p className="small muted">
        A TMDB id, a link to its TMDB page, or just the name. Useful when two shows share a title —
        search “The Office” and pick the right one.
      </p>

      <div className="row">
        <input
          placeholder="1396, themoviedb.org/tv/1396, or Breaking Bad"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void look()}
          style={{ flex: "1 1 260px" }}
        />
        <button className="primary" onClick={() => void look()} disabled={busy || input.trim() === ""}>
          {busy ? "Asking TMDB…" : "Look it up"}
        </button>
      </div>

      <label className="row small muted" style={{ marginTop: 8, gap: 8 }}>
        <input type="checkbox" checked={watched} onChange={(e) => setWatched(e.target.checked)} />
        <span>We have already watched all of it</span>
      </label>

      {note && <p className="small" style={{ marginBottom: 0 }}>{note}</p>}

      {results.length > 0 && (
        <div className="stack" style={{ marginTop: 10 }}>
          {results.map((hit) => (
            <button
              key={hit.id}
              className="row"
              style={{ textAlign: "left", alignItems: "center", gap: 10 }}
              onClick={() => void add(hit.id)}
            >
              {hit.poster_path && (
                <img src={IMAGE_BASE + hit.poster_path} alt="" width={30} height={45} style={{ borderRadius: 4 }} />
              )}
              <span className="stack" style={{ flex: "1 1 auto", minWidth: 0 }}>
                <span>
                  {hit.name}
                  {hit.first_air_date && <span className="muted"> ({hit.first_air_date.slice(0, 4)})</span>}
                </span>
                <span className="small muted aside-title">{hit.overview || "No description."}</span>
              </span>
              <span className="pill">#{hit.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
