import { useMemo, useState } from "react";
import { LEDGERS, watchState } from "../lib/ledgers";
import type { Store } from "../lib/store";
import type { Dataset, Show } from "../lib/types";

type Mode = "watched" | "plex";
type Filter = "in_progress" | "started" | "won" | "plex" | "missing" | "all";

const FILTERS: { id: Filter; label: string; blurb: string }[] = [
  { id: "in_progress", label: "Part-watched", blurb: "Started and not finished" },
  { id: "started", label: "Never ticked", blurb: "Marked as started in the workbook, with no seasons ticked yet" },
  { id: "won", label: "Won a draw", blurb: "Shows a draw has picked" },
  { id: "plex", label: "On Plex", blurb: "Anything with a season on the server" },
  { id: "missing", label: "Not on Plex", blurb: "Part-watched shows with nothing on the server" },
  { id: "all", label: "Everything", blurb: "" },
];

/**
 * Ticking off seasons: what you have watched, and what is sitting on Plex.
 *
 * Both are the same gesture over the same grid of seasons, so they share a
 * screen and a switch rather than two near-identical pages.
 */
export function LibraryView({ store, data }: { store: Store; data: Dataset }) {
  const [mode, setMode] = useState<Mode>("watched");
  const [filter, setFilter] = useState<Filter>("in_progress");
  const [query, setQuery] = useState("");

  const won = useMemo(() => new Set(data.history.map((d) => d.winnerId)), [data.history]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.shows
      // A universe has its own ordered checklist; it has no seasons to tick here.
      .filter((show) => !show.universeEntry)
      .filter((show) => {
        if (needle) return show.title.toLowerCase().includes(needle);
        const onPlex = (data.plex.shows[show.id] ?? []).length > 0;
        switch (filter) {
          case "in_progress":
            return watchState(show) === "in_progress";
          case "started":
            return show.startedNotFinished === true && watchState(show) === "unwatched";
          case "won":
            return won.has(show.id);
          case "plex":
            return onPlex;
          case "missing":
            return !onPlex && (watchState(show) === "in_progress" || won.has(show.id));
          case "all":
            return true;
        }
      })
      // Shows with a season list first: those are the ones you can act on.
      .sort((a, b) => Number(b.seasons.length > 0) - Number(a.seasons.length > 0))
      .slice(0, needle ? 80 : 200);
  }, [data.plex.shows, data.shows, filter, query, won]);

  const plexCount = Object.keys(data.plex.shows).length;

  return (
    <>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <strong className="small">Ticking off</strong>
            <button aria-current={mode === "watched"} onClick={() => setMode("watched")}>
              Seasons we have watched
            </button>
            <button aria-current={mode === "plex"} onClick={() => setMode("plex")}>
              Seasons on Plex
            </button>
          </div>
          <span className="small muted">
            {plexCount ? `${plexCount} shows on the server` : "Nothing recorded on Plex yet"}
            {data.plex.updatedAt && ` · synced ${new Date(data.plex.updatedAt).toLocaleDateString()}`}
          </span>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          {FILTERS.map((f) => (
            <button key={f.id} aria-current={filter === f.id} title={f.blurb} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
          <input
            placeholder="or search every show…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: "1 1 180px" }}
          />
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {mode === "watched"
            ? "Click a season to mark it watched. A show drops off the ballots once every season is ticked."
            : "Click a season to record that it is on the server."}
        </p>
      </div>

      <div className="panel scroll">
        {shown.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Nothing here.</p>
        ) : (
          shown.map((show) => (
            <ShowSeasons key={show.id} store={store} data={data} show={show} mode={mode} />
          ))
        )}
      </div>
    </>
  );
}

function ShowSeasons({
  store,
  data,
  show,
  mode,
}: {
  store: Store;
  data: Dataset;
  show: Show;
  mode: Mode;
}) {
  const onPlex = new Set(data.plex.shows[show.id] ?? []);
  const watched = show.seasons.filter((s) => s.watched).length;
  const finished = show.seasons.length > 0 && watched === show.seasons.length;
  // Points still sitting on a show you have finished can never win again.
  const held = LEDGERS.flatMap((l) =>
    data.people.map((p) => show.votes[l.id]?.[p] ?? 0),
  ).reduce((a, b) => a + b, 0);

  function toggle(season: number, current: boolean) {
    if (mode === "watched") {
      store.dispatch({ type: "season", showId: show.id, season, watched: !current });
    } else {
      store.dispatch({ type: "plexSeason", showId: show.id, season, present: !current });
    }
  }

  /** Tick or untick the whole run in one go. */
  function setAll(value: boolean) {
    store.dispatch(
      ...show.seasons.map((season) =>
        mode === "watched"
          ? ({ type: "season", showId: show.id, season: season.number, watched: value } as const)
          : ({ type: "plexSeason", showId: show.id, season: season.number, present: value } as const),
      ),
    );
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong className="small">{show.title}</strong>
        <span className="row small muted">
          {mode === "watched"
            ? `${watched}/${show.seasons.length || "?"} watched`
            : `${onPlex.size}/${show.seasons.length || "?"} on Plex`}
          {show.seasons.length > 0 && (
            <>
              <button className="small" onClick={() => setAll(true)}>All</button>
              <button className="small" onClick={() => setAll(false)}>None</button>
            </>
          )}
        </span>
      </div>

      {finished && held > 0 && (
        <div className="row" style={{ marginTop: 6 }}>
          <span className="small">
            Finished, and still holding {held.toLocaleString()} points across the ballots.
          </span>
          <button className="small" onClick={() => store.dispatch({ type: "freePoints", showId: show.id })}>
            Take the points back
          </button>
        </div>
      )}

      {show.seasons.length === 0 ? (
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          No season list yet — the nightly refresh fills these in from TMDB.
        </p>
      ) : (
        <div className="seasons" style={{ marginTop: 6 }}>
          {show.seasons.map((season) => {
            const marked = mode === "watched" ? season.watched : onPlex.has(season.number);
            const other = mode === "watched" ? onPlex.has(season.number) : season.watched;
            return (
              <button
                key={season.number}
                className={`season${marked ? " watched" : ""}`}
                onClick={() => toggle(season.number, marked)}
                title={other ? (mode === "watched" ? "On Plex" : "Already watched") : undefined}
              >
                <span>{marked ? "✓" : "○"}</span>
                <span>S{season.number}</span>
                <span className="muted">{season.episodes} ep</span>
                {other && <span className="muted">{mode === "watched" ? "⛁" : "👁"}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
