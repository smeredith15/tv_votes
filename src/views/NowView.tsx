import { useMemo, useState } from "react";
import { LEDGERS, ballotFor, caughtUp, episodesPerWeek, unwatchedSeasons } from "../lib/ledgers";
import type { Store } from "../lib/store";
import type { Dataset, LedgerId, Show } from "../lib/types";
import { Poster, ProviderTags, StatusPill } from "./ShowBits";

/**
 * What a ballot is currently on: whatever was chosen by hand, otherwise the
 * last draw it kept. An explicit null means the ballot was cleared on purpose.
 */
function pickFor(data: Dataset, ledger: LedgerId): Show | null {
  const chosen = data.watching.picks[ledger];
  if (chosen === null) return null;
  if (chosen) return data.shows.find((s) => s.id === chosen) ?? null;

  for (let i = data.history.length - 1; i >= 0; i--) {
    const draw = data.history[i];
    if (draw.ledger !== ledger) continue;
    const show = data.shows.find((s) => s.id === draw.winnerId);
    if (!show) continue;
    return caughtUp(show) ? null : show;
  }
  return null;
}

export function NowView({ store, data }: { store: Store; data: Dataset }) {
  /** Shows set to pick themselves back up, with something waiting. */
  const resuming = useMemo(
    () => data.shows.filter((s) => s.autoResume && unwatchedSeasons(s).length > 0),
    [data.shows],
  );

  return (
    <div className="now">
      <div className="now-main">
        {LEDGERS.map((ledger) => (
          <PickCard key={ledger.id} store={store} data={data} ledger={ledger.id} />
        ))}

        {resuming.length > 0 && (
          <div className="panel">
            <strong>Picks itself back up</strong>
            <p className="small muted">
              New seasons of shows you told the app not to put to a vote again.
            </p>
            {resuming.map((show) => (
              <div key={show.id} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
                <span className="stack">
                  <strong className="small">{show.title}</strong>
                  <span className="small muted">
                    Season{unwatchedSeasons(show).length > 1 ? "s" : ""} {unwatchedSeasons(show).join(", ")} waiting
                  </span>
                </span>
                <span className="row small">
                  <ProviderTags show={show} limit={2} />
                  <button className="small" onClick={() => store.dispatch({ type: "aside", showId: show.id, add: true })}>
                    Add to the side list
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AsidePanel store={store} data={data} />
    </div>
  );
}

function PickCard({ store, data, ledger }: { store: Store; data: Dataset; ledger: LedgerId }) {
  const [choosing, setChoosing] = useState(false);
  const show = pickFor(data, ledger);
  const ledgerName = LEDGERS.find((l) => l.id === ledger)!.name;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">{ledgerName}</span>
        <span className="row small">
          <button className="small" onClick={() => setChoosing(!choosing)}>
            {show ? "Pick something else" : "Choose a show"}
          </button>
          {show && (
            <button className="small" onClick={() => store.dispatch({ type: "setPick", ledger, showId: null })}>
              Clear
            </button>
          )}
        </span>
      </div>

      {choosing && (
        <ShowPicker
          data={data}
          onPick={(id) => {
            store.dispatch({ type: "setPick", ledger, showId: id });
            setChoosing(false);
          }}
        />
      )}

      {show ? <PickBody store={store} data={data} ledger={ledger} show={show} /> : (
        <p className="small muted" style={{ marginBottom: 0 }}>
          Nothing on the go. Draw one, or choose it yourself.
        </p>
      )}
    </div>
  );
}

function PickBody({
  store,
  data,
  ledger,
  show,
}: {
  store: Store;
  data: Dataset;
  ledger: LedgerId;
  show: Show;
}) {
  const ballot = ballotFor(show, ledger);
  const onDeck = show.seasons.filter((s) => ballot.seasons.includes(s.number) && !s.watched);
  const episodesLeft = onDeck.reduce((sum, s) => sum + s.episodes, 0);
  const weeksLeft = Math.ceil(episodesLeft / episodesPerWeek(show));
  const universe = data.universes.find((u) => u.id === show.universe);
  const nextUp = universe?.order.find((i) => !i.watched);

  return (
    <>
      <div className="row" style={{ alignItems: "flex-start", marginTop: 8 }}>
        <Poster show={show} size={64} />
        <div className="stack" style={{ flex: "1 1 220px" }}>
          <strong style={{ fontSize: 19 }}>{show.title}</strong>
          <span className="small">{nextUp ? `Up next: ${nextUp.label}` : ballot.label}</span>
          <span className="row small" style={{ gap: 6 }}>
            <StatusPill show={show} />
            <ProviderTags show={show} limit={3} />
            {(data.plex.shows[show.id] ?? []).length > 0 && <span className="pill flat">On Plex</span>}
          </span>
        </div>
        {episodesLeft > 0 && (
          <div className="stack" style={{ alignItems: "flex-end" }}>
            <strong style={{ fontSize: 22 }}>{episodesLeft}</strong>
            <span className="small muted">
              episode{episodesLeft === 1 ? "" : "s"} to go
              {ledger === "weekly" && ` · ${weeksLeft} Friday${weeksLeft === 1 ? "" : "s"}`}
            </span>
          </div>
        )}
      </div>

      {onDeck.length > 0 && (
        <div className="seasons" style={{ marginTop: 12 }}>
          {onDeck.map((season) => (
            <button
              key={season.number}
              className="season ballot"
              onClick={() =>
                store.dispatch({ type: "season", showId: show.id, season: season.number, watched: true })
              }
              title="Mark this season watched"
            >
              <span>○</span>
              <span>S{season.number}</span>
              <span className="muted">{season.episodes} ep</span>
            </button>
          ))}
        </div>
      )}

      {show.status === "returning" && (
        <label className="row small muted" style={{ marginTop: 10, gap: 8 }}>
          <input
            type="checkbox"
            checked={show.autoResume === true}
            onChange={(e) =>
              store.dispatch({ type: "field", showId: show.id, patch: { autoResume: e.target.checked } })
            }
          />
          <span>When a new season lands, start it rather than putting it to a vote.</span>
        </label>
      )}
    </>
  );
}

/**
 * Where a show stands, in a few words. A show with no season list yet is not
 * finished — TMDB simply has not filled it in.
 */
function describeProgress(show: Show): string {
  if (show.seasons.length === 0) return "seasons not known yet";
  const left = unwatchedSeasons(show).length;
  return left === 0 ? "finished" : `${left} season${left === 1 ? "" : "s"} left`;
}

/** Search the whole list to put a ballot, or the side list, on something. */
function ShowPicker({ data, onPick }: { data: Dataset; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return data.shows
      // Nothing to start on a show with every aired season ticked off.
      .filter((show) => !caughtUp(show))
      .filter((show) => show.title.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [data.shows, query]);

  return (
    <div className="stack" style={{ marginTop: 10 }}>
      <input autoFocus placeholder="Search every show…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {matches.map((show) => (
        <button key={show.id} className="small" style={{ textAlign: "left" }} onClick={() => onPick(show.id)}>
          {show.title}
          <span className="muted"> · {describeProgress(show)}</span>
        </button>
      ))}
      {query.trim().length >= 2 && matches.length === 0 && (
        <span className="small muted">Nothing matches.</span>
      )}
    </div>
  );
}

/**
 * One show on the side, with its seasons a click away.
 *
 * Nothing here goes through a ballot, so this is the only place these seasons
 * can be ticked off — collapsed by default, because the panel is narrow and a
 * long-running show would otherwise fill it.
 */
function AsideRow({ store, show }: { store: Store; show: Show }) {
  const [open, setOpen] = useState(false);
  const left = unwatchedSeasons(show);
  const watched = show.seasons.length - left.length;

  return (
    <div className="aside-row-wrap">
      <div className="row aside-row">
        <button
          className="stack aside-open"
          onClick={() => setOpen(!open)}
          disabled={show.seasons.length === 0}
          title={show.seasons.length ? "Show the seasons" : undefined}
        >
          <span className="small aside-title">{show.title}</span>
          <span className="small muted">
            {show.seasons.length === 0
              ? describeProgress(show)
              : `${watched}/${show.seasons.length} watched${left.length ? ` · S${left[0]} next` : ""}`}
          </span>
        </button>
        <button
          className="small"
          title="Remove"
          onClick={() => store.dispatch({ type: "aside", showId: show.id, add: false })}
        >
          ×
        </button>
      </div>

      {open && show.seasons.length > 0 && (
        <div className="seasons" style={{ paddingBottom: 6 }}>
          {show.seasons.map((season) => (
            <button
              key={season.number}
              className={`season${season.watched ? " watched" : ""}`}
              onClick={() =>
                store.dispatch({
                  type: "season",
                  showId: show.id,
                  season: season.number,
                  watched: !season.watched,
                })
              }
            >
              <span>{season.watched ? "✓" : "○"}</span>
              <span>S{season.number}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Things being watched outside the voting: no ballot, no draw, just a list. */
function AsidePanel({ store, data }: { store: Store; data: Dataset }) {
  const [adding, setAdding] = useState(false);
  const shows = data.watching.asides
    .map((id) => data.shows.find((s) => s.id === id))
    .filter((s): s is Show => s !== undefined);
  const finished = shows.filter(caughtUp);

  return (
    <aside className="now-side panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong className="small">On the side</strong>
        <button className="small" onClick={() => setAdding(!adding)}>
          {adding ? "Done" : "Add"}
        </button>
      </div>
      <p className="small muted">Watched outside the voting.</p>

      {finished.length > 0 && (
        <button
          className="small"
          onClick={() =>
            store.dispatch(...finished.map((show) => ({ type: "aside" as const, showId: show.id, add: false })))
          }
        >
          Clear {finished.length} caught up
        </button>
      )}

      {adding && (
        <ShowPicker
          data={data}
          onPick={(id) => {
            store.dispatch({ type: "aside", showId: id, add: true });
            setAdding(false);
          }}
        />
      )}

      <div className="stack now-side-list">
        {shows.length === 0 && !adding && <span className="small muted">Nothing here yet.</span>}
        {shows.map((show) => (
          <AsideRow key={show.id} store={store} show={show} />
        ))}
      </div>
    </aside>
  );
}
