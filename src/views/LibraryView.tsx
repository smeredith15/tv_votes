import { memo, useMemo, useState } from "react";
import { LEDGERS, watchState } from "../lib/ledgers";
import type { Store } from "../lib/store";
import type { Dataset, Show } from "../lib/types";

type Filter = "in_progress" | "started" | "won" | "plex" | "missing" | "all";

const FILTERS: { id: Filter; label: string; blurb: string }[] = [
  { id: "all", label: "Everything", blurb: "Every show on the list" },
  { id: "in_progress", label: "Part-watched", blurb: "Started and not finished" },
  { id: "started", label: "Never ticked", blurb: "Marked as started in the workbook, with no seasons ticked yet" },
  { id: "won", label: "Won a draw", blurb: "Shows a draw has picked" },
  { id: "plex", label: "On Plex", blurb: "Anything with a season on the server" },
  { id: "missing", label: "Not on Plex", blurb: "Part-watched shows with nothing on the server" },
];

/**
 * Ticking off seasons: what you have watched, and what is sitting on Plex.
 *
 * Both are the same gesture over the same grid of seasons, so they share a
 * screen and a switch rather than two near-identical pages.
 */
const PAGE = 60;

export function LibraryView({ store, data }: { store: Store; data: Dataset }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

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
      .sort((a, b) => Number(b.seasons.length > 0) - Number(a.seasons.length > 0));
  }, [data.plex.shows, data.shows, filter, query, won]);

  const plexCount = Object.keys(data.plex.shows).length;
  const visible = shown.slice(0, limit);

  return (
    <>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong className="small">Ticking off what we have watched, and what is on Plex</strong>
          <span className="small muted">
            {plexCount ? `${plexCount} shows on the server` : "Nothing marked on Plex yet"}
          </span>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              aria-current={filter === f.id}
              title={f.blurb}
              onClick={() => {
                setFilter(f.id);
                setLimit(PAGE);
              }}
            >
              {f.label}
            </button>
          ))}
          <input
            placeholder="or search every show…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            style={{ flex: "1 1 180px" }}
          />
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {shown.length.toLocaleString()} shows. Each has a row for the seasons you have watched and a
          row for the ones sitting on Plex.
        </p>
      </div>

      <div className="panel scroll">
        {shown.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Nothing here.</p>
        ) : (
          visible.map((show) => (
            <ShowSeasons
              key={show.id}
              show={show}
              onPlex={data.plex.shows[show.id]}
              people={data.people}
              dispatch={store.dispatch}
            />
          ))
        )}
        {shown.length > visible.length && (
          <button className="small" style={{ marginTop: 10 }} onClick={() => setLimit(limit + PAGE * 2)}>
            Show more ({(shown.length - visible.length).toLocaleString()} to go)
          </button>
        )}
      </div>
    </>
  );
}

interface SeasonsProps {
  show: Show;
  /** Season numbers on the server, straight from the Plex file. */
  onPlex?: number[];
  people: string[];
  dispatch: Store["dispatch"];
}

/**
 * One show, with a row of seasons for each thing worth recording: the ones you
 * have watched, and the ones on the server. Both are on screen together —
 * hiding one behind a switch made marking Plex hard to find at all.
 *
 * Memoised on props that hold their identity between renders, so ticking one
 * season redraws that show alone rather than every row on screen.
 */
const ShowSeasons = memo(function ShowSeasons({ show, onPlex, people, dispatch }: SeasonsProps) {
  const present = new Set(onPlex ?? []);
  const watched = show.seasons.filter((s) => s.watched).length;
  const finished = show.seasons.length > 0 && watched === show.seasons.length;
  // Points still sitting on a show you have finished can never win again.
  const held = LEDGERS.flatMap((l) => people.map((p) => show.votes[l.id]?.[p] ?? 0)).reduce(
    (a, b) => a + b,
    0,
  );

  function setAll(row: "watched" | "plex", value: boolean) {
    dispatch(
      ...show.seasons.map((season) =>
        row === "watched"
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
          {show.status === "returning" && (
            <label className="row small" style={{ gap: 5 }} title="Start a new season rather than voting on it">
              <input
                type="checkbox"
                checked={show.autoResume === true}
                onChange={(e) =>
                  dispatch({ type: "field", showId: show.id, patch: { autoResume: e.target.checked } })
                }
              />
              <span>auto</span>
            </label>
          )}
          {show.seasons.length > 0 && `${watched}/${show.seasons.length} watched`}
        </span>
      </div>

      {finished && held > 0 && (
        <div className="row" style={{ marginTop: 6 }}>
          <span className="small">
            Finished, and still holding {held.toLocaleString()} points across the ballots.
          </span>
          <button className="small" onClick={() => dispatch({ type: "freePoints", showId: show.id })}>
            Take the points back
          </button>
        </div>
      )}

      {show.seasons.length === 0 ? (
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          No season list yet — the nightly refresh fills these in from TMDB.
        </p>
      ) : (
        <>
          <SeasonRow
            label="Watched"
            seasons={show.seasons.map((s) => ({ number: s.number, episodes: s.episodes, on: s.watched }))}
            onToggle={(number, on) => dispatch({ type: "season", showId: show.id, season: number, watched: !on })}
            onAll={(value) => setAll("watched", value)}
          />
          <SeasonRow
            label="On Plex"
            seasons={show.seasons.map((s) => ({
              number: s.number,
              episodes: s.episodes,
              on: present.has(s.number),
            }))}
            onToggle={(number, on) =>
              dispatch({ type: "plexSeason", showId: show.id, season: number, present: !on })
            }
            onAll={(value) => setAll("plex", value)}
          />
        </>
      )}
    </div>
  );
});

function SeasonRow({
  label,
  seasons,
  onToggle,
  onAll,
}: {
  label: string;
  seasons: { number: number; episodes: number; on: boolean }[];
  onToggle: (number: number, on: boolean) => void;
  onAll: (value: boolean) => void;
}) {
  return (
    <div className="row season-row">
      <span className="small muted season-row-label">{label}</span>
      <div className="seasons" style={{ flex: "1 1 auto" }}>
        {seasons.map((season) => (
          <button
            key={season.number}
            className={`season${season.on ? " watched" : ""}`}
            onClick={() => onToggle(season.number, season.on)}
          >
            <span>{season.on ? "\u2713" : "\u25cb"}</span>
            <span>S{season.number}</span>
            <span className="muted">{season.episodes} ep</span>
          </button>
        ))}
        <button className="small" onClick={() => onAll(true)}>All</button>
        <button className="small" onClick={() => onAll(false)}>None</button>
      </div>
    </div>
  );
}
