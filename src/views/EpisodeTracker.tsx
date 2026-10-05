import { useState } from "react";
import {
  episodesFromSeasons,
  formatPosition,
  pace,
  perSitting,
  positionAfter,
  totalEpisodes,
} from "../lib/episodes";
import type { Store } from "../lib/store";
import type { LedgerId, Progress, Show } from "../lib/types";

interface Props {
  store: Store;
  ledger: LedgerId;
  show: Show;
  stored?: Progress;
}

/**
 * Where you are in a run, episode by episode.
 *
 * Seasons are too coarse for the Friday show: it goes at a fixed rate, so
 * falling behind is measured in episodes, and the useful question is which one
 * you are supposed to be on tonight.
 */
export function EpisodeTracker({ store, ledger, show, stored }: Props) {
  const [editing, setEditing] = useState(false);

  const total = totalEpisodes(show);
  if (total === 0) return null;

  const progress: Progress =
    stored?.showId === show.id
      ? stored
      : // Nothing recorded yet: start from whatever the season ticks already say.
        { showId: show.id, episode: episodesFromSeasons(show), startEpisode: 0, longWeekends: 0 };

  const watched = progress.episode;
  const upNext = positionAfter(show.seasons, watched);
  const schedule =
    ledger === "weekly" && progress.startedOn
      ? pace(show, {
          startedOn: progress.startedOn,
          startEpisode: progress.startEpisode,
          longWeekends: progress.longWeekends,
          watched,
        })
      : null;

  const move = (episode: number) =>
    store.dispatch({ type: "setEpisode", ledger, showId: show.id, episode });

  return (
    <div className="tracker">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="row">
          <button className="small" onClick={() => move(watched - 1)} disabled={watched <= 0} title="Back one">
            −
          </button>
          <strong>{formatPosition(upNext)}</strong>
          <span className="small muted">up next</span>
          <button className="small" onClick={() => move(watched + 1)} disabled={watched >= total} title="Watched one">
            +
          </button>
        </span>
        <span className="small muted">
          {watched} of {total} watched
        </span>
      </div>

      <div className="meter" style={{ marginTop: 8 }}>
        <div style={{ width: `${(watched / total) * 100}%` }} />
      </div>

      {ledger === "weekly" && (
        <Schedule
          store={store}
          ledger={ledger}
          show={show}
          progress={progress}
          watched={watched}
          editing={editing}
          setEditing={setEditing}
          scheduled={schedule}
        />
      )}
    </div>
  );
}

function Schedule({
  store,
  ledger,
  show,
  progress,
  watched,
  editing,
  setEditing,
  scheduled,
}: {
  store: Store;
  ledger: LedgerId;
  show: Show;
  progress: Progress;
  watched: number;
  editing: boolean;
  setEditing: (value: boolean) => void;
  scheduled: ReturnType<typeof pace>;
}) {
  const rate = perSitting(show);

  if (!progress.startedOn || editing) {
    return (
      <StartForm
        store={store}
        ledger={ledger}
        show={show}
        watched={watched}
        progress={progress}
        onDone={() => setEditing(false)}
      />
    );
  }

  const behind = scheduled ? -scheduled.episodesAhead : 0;
  const shouldBe = scheduled ? positionAfter(show.seasons, scheduled.target) : null;

  return (
    <>
      <p className={`small ${behind > 0 ? "" : "muted"}`} style={{ margin: "10px 0 0" }}>
        {scheduled === null ? (
          "Start date not understood."
        ) : behind > 0 ? (
          <>
            <strong>{behind} behind.</strong> By tonight you should be on {formatPosition(shouldBe)} —{" "}
            {scheduled.sittings} Friday{scheduled.sittings === 1 ? "" : "s"} since{" "}
            {new Date(`${progress.startedOn}T00:00:00`).toLocaleDateString()}
            {progress.longWeekends > 0 && `, plus ${progress.longWeekends} long weekend${progress.longWeekends === 1 ? "" : "s"}`}.
          </>
        ) : behind < 0 ? (
          <>
            {-behind} ahead of the schedule — {formatPosition(shouldBe)} was tonight's.
          </>
        ) : (
          <>Right on schedule for tonight.</>
        )}
      </p>

      <div className="row small" style={{ marginTop: 8 }}>
        <span className="muted">
          {rate} episode{rate === 1 ? "" : "s"} a week
        </span>
        <button
          className="small"
          onClick={() => store.dispatch({ type: "longWeekend", ledger, showId: show.id, delta: 1 })}
          title={`A double sitting: ${rate * 2} episodes that week`}
        >
          + Long weekend
        </button>
        {progress.longWeekends > 0 && (
          <>
            <span className="pill">{progress.longWeekends} banked</span>
            <button
              className="small"
              onClick={() => store.dispatch({ type: "longWeekend", ledger, showId: show.id, delta: -1 })}
            >
              −
            </button>
          </>
        )}
        <button className="small" onClick={() => setEditing(true)}>
          Change the start
        </button>
      </div>
    </>
  );
}

/** Recording when a run began — and where it began from, for a show picked up mid-way. */
function StartForm({
  store,
  ledger,
  show,
  watched,
  progress,
  onDone,
}: {
  store: Store;
  ledger: LedgerId;
  show: Show;
  watched: number;
  progress: Progress;
  onDone: () => void;
}) {
  const [date, setDate] = useState(progress.startedOn ?? new Date().toISOString().slice(0, 10));

  return (
    <div className="row small" style={{ marginTop: 10 }}>
      <span className="muted">Started on</span>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button
        className="primary small"
        onClick={() => {
          store.dispatch({
            type: "startRun",
            ledger,
            showId: show.id,
            startedOn: date,
            // Where you were that night, which is where you are now unless the
            // run has already moved on.
            startEpisode: progress.startedOn ? progress.startEpisode : watched,
          });
          onDone();
        }}
      >
        Save
      </button>
      {progress.startedOn && (
        <button className="small" onClick={onDone}>
          Cancel
        </button>
      )}
      <span className="muted">so the app can say where you should be by now</span>
    </div>
  );
}
