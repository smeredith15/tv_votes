import { LEDGERS, ballotFor, episodesPerWeek, watchState } from "../lib/ledgers";
import type { Store } from "../lib/store";
import type { Dataset, Draw, LedgerId, Show } from "../lib/types";
import { Poster, ProviderTags, StatusPill } from "./ShowBits";

/** The show a ballot last landed on, unless you have since finished it. */
function currentPick(data: Dataset, ledger: LedgerId): { draw: Draw; show: Show } | null {
  for (let i = data.history.length - 1; i >= 0; i--) {
    const draw = data.history[i];
    if (draw.ledger !== ledger) continue;
    const show = data.shows.find((s) => s.id === draw.winnerId);
    if (!show) continue;
    return watchState(show) === "complete" ? null : { draw, show };
  }
  return null;
}

/**
 * What you are in the middle of: one card per ballot, with the season you are
 * on, where it is streaming, and — for Friday nights — how many of them are
 * left before this pick runs out.
 */
export function NowView({ store, data }: { store: Store; data: Dataset }) {
  const anyPick = LEDGERS.some((l) => currentPick(data, l.id) !== null);

  return (
    <>
      {!anyPick && (
        <div className="panel">
          <strong>Nothing on the go</strong>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Once a draw is kept, whatever it landed on shows up here until you have finished it.
          </p>
        </div>
      )}

      {LEDGERS.map((ledger) => {
        const pick = currentPick(data, ledger.id);
        if (!pick) return null;
        return <PickCard key={ledger.id} store={store} data={data} ledger={ledger.id} pick={pick} />;
      })}
    </>
  );
}

function PickCard({
  store,
  data,
  ledger,
  pick,
}: {
  store: Store;
  data: Dataset;
  ledger: LedgerId;
  pick: { draw: Draw; show: Show };
}) {
  const { show, draw } = pick;
  const ledgerName = LEDGERS.find((l) => l.id === ledger)!.name;
  const ballot = ballotFor(show, ledger);
  const onDeck = show.seasons.filter((s) => ballot.seasons.includes(s.number) && !s.watched);
  const episodesLeft = onDeck.reduce((sum, s) => sum + s.episodes, 0);
  const perWeek = episodesPerWeek(show);
  const weeksLeft = episodesLeft > 0 ? Math.ceil(episodesLeft / perWeek) : 0;
  const universe = data.universes.find((u) => u.id === show.universe);
  const nextUp = universe?.order.find((i) => !i.watched);

  return (
    <div className="panel">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Poster show={show} size={64} />
        <div className="stack" style={{ flex: "1 1 260px" }}>
          <span className="small muted">{ledgerName}</span>
          <strong style={{ fontSize: 19 }}>{show.title}</strong>
          <span className="small">
            {nextUp ? `Up next: ${nextUp.label}` : ballot.label}
            {" · drawn "}
            {new Date(draw.drawnAt).toLocaleDateString()}
          </span>
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

      {onDeck.length === 0 && !nextUp && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          Everything this draw covered is ticked off — draw again when you are ready.
        </p>
      )}
    </div>
  );
}
