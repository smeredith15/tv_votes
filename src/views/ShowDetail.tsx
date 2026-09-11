import { useState } from "react";
import {
  bestMatch,
  createClient,
  toFormat,
  toProviders,
  toReturningStatus,
  toRuntime,
  toSeasons,
} from "../../scripts/tmdb.mjs";
import { drawsFor, showRecords } from "../lib/history";
import { LEDGERS, ballotFor, eligibleLedgers, watchState } from "../lib/ledgers";
import type { Store } from "../lib/store";
import type { Dataset, Show } from "../lib/types";
import { Poster, ProviderTags, StatusPill } from "./ShowBits";

interface Props {
  store: Store;
  data: Dataset;
  show: Show;
  onClose: () => void;
}

export function ShowDetail({ store, data, show, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ledgers = eligibleLedgers(show);
  const state = watchState(show);
  const record = showRecords(data.history).get(show.id);

  /** Pull fresh seasons, providers and status for this one show, from the browser. */
  async function refresh() {
    const key = store.settings.tmdbKey;
    if (!key) {
      setNote("Add your TMDB key in Settings first.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const tmdb = createClient({ key, region: store.settings.region });
      let id = show.tmdbId;
      if (!id) {
        const hit = bestMatch(show.title, await tmdb.search(show.title));
        if (!hit) {
          setNote("TMDB has nothing under that title — paste the id by hand below.");
          return;
        }
        id = hit.id;
      }
      const [details, providers] = await Promise.all([tmdb.details(id), tmdb.providers(id)]);
      store.dispatch({
        type: "field",
        showId: show.id,
        patch: {
          tmdbId: id,
          status: toReturningStatus(details),
          nextAirDate: (details as { next_episode_to_air?: { air_date?: string } }).next_episode_to_air?.air_date ?? null,
          runtime: show.runtime ?? toRuntime(details),
          format: toFormat(details, show.format),
          seasons: toSeasons(details, show.seasons),
          providers: toProviders(providers),
          poster: show.poster ?? ((details as { poster_path?: string }).poster_path ?? null),
          providersUpdated: new Date().toISOString(),
        },
      });
      setNote("Updated.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function patch(fields: Partial<Show>) {
    store.dispatch({ type: "field", showId: show.id, patch: fields });
  }

  return (
    <div className="panel">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Poster show={show} size={70} />
        <div className="stack" style={{ flex: "1 1 220px" }}>
          <div className="row">
            <strong style={{ fontSize: 18 }}>{show.title}</strong>
            <StatusPill show={show} verbose />
            {show.universe && <span className="pill universe">{show.universeEntry ? "Universe" : "Watched in the universe"}</span>}
          </div>
          <div className="row small">
            <ProviderTags show={show} verbose />
          </div>
          <div className="small muted">
            {ledgers.length ? `On the ${ledgers.map((l) => LEDGERS.find((x) => x.id === l)!.name).join(", ")} ballot${ledgers.length > 1 ? "s" : ""}` : "Not on any ballot"}
            {record && ` · voted on ${record.appearances}× · ${record.wins} win${record.wins === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="spacer" />
        <button onClick={onClose}>Close</button>
      </div>

      {show.startedNotFinished && state === "unwatched" && (
        <p className="banner" style={{ marginTop: 12 }}>
          Marked as started in the old workbook, but no seasons are ticked yet. Tick what you have seen.
        </p>
      )}

      <div style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong className="small">Seasons</strong>
          <button onClick={() => void refresh()} disabled={busy}>
            {busy ? "Asking TMDB…" : "Refresh from TMDB"}
          </button>
        </div>
        {note && <p className="small muted" style={{ margin: "6px 0" }}>{note}</p>}
        {show.seasons.length === 0 ? (
          <p className="small muted">No season list yet — refresh from TMDB to fill it in.</p>
        ) : (
          <div className="seasons" style={{ marginTop: 8 }}>
            {show.seasons.map((season) => {
              const onBallot = ledgers.some((l) => ballotFor(show, l).seasons.includes(season.number));
              return (
                <button
                  key={season.number}
                  className={`season${season.watched ? " watched" : ""}${onBallot && !season.watched ? " ballot" : ""}`}
                  title={onBallot && !season.watched ? "This is what a vote would commit you to" : undefined}
                  onClick={() =>
                    store.dispatch({ type: "season", showId: show.id, season: season.number, watched: !season.watched })
                  }
                >
                  <span>{season.watched ? "✓" : "○"}</span>
                  <span>S{season.number}</span>
                  <span className="muted">{season.episodes} ep</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <label className="stack small">
          <span className="muted">Runtime</span>
          <select value={show.runtime ?? ""} onChange={(e) => patch({ runtime: e.target.value ? (Number(e.target.value) as 30 | 60) : null })}>
            <option value="">Unknown</option>
            <option value="30">Half-hour</option>
            <option value="60">Hour-long</option>
          </select>
        </label>
        <label className="stack small">
          <span className="muted">Format</span>
          <select value={show.format} onChange={(e) => patch({ format: e.target.value as Show["format"] })}>
            <option value="series">Series</option>
            <option value="mini">Miniseries</option>
            <option value="anthology">Anthology</option>
            <option value="documentary">Documentary</option>
            <option value="limited">One and done</option>
          </select>
        </label>
        <label className="stack small">
          <span className="muted">Universe</span>
          <select value={show.universe ?? ""} onChange={(e) => patch({ universe: e.target.value || null })}>
            <option value="">None</option>
            {data.universes.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className="stack small">
          <span className="muted">TMDB id</span>
          <input
            type="number"
            value={show.tmdbId ?? ""}
            placeholder="unmatched"
            onChange={(e) => patch({ tmdbId: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
      </div>

      <div className="row small" style={{ marginTop: 14 }}>
        {LEDGERS.map((l) => {
          const total = data.people.reduce((sum, p) => sum + (show.votes[l.id]?.[p] ?? 0), 0);
          return total > 0 ? (
            <span key={l.id} className="pill">{l.name}: {total} pts</span>
          ) : null;
        })}
      </div>

      {drawsFor(data, show.id).length > 0 && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Last on a ballot {new Date(drawsFor(data, show.id).at(-1)!.drawnAt).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}
