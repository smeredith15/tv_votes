import { useMemo, useState } from "react";
import type { Store } from "../lib/store";
import type { Dataset, Universe } from "../lib/types";

/**
 * The combined universes are one ballot entry each, but watching them means
 * working through a hand-ordered interleave of episodes and films. This is the
 * bookmark: what is done, what is next.
 */
export function UniverseView({ store, data }: { store: Store; data: Dataset }) {
  const [id, setId] = useState(data.universes[0]?.id ?? "");
  const universe = data.universes.find((u) => u.id === id);

  if (!universe) return <p className="muted">No universes set up.</p>;

  return (
    <>
      <div className="row" style={{ marginTop: 14 }}>
        {data.universes.map((u) => (
          <button key={u.id} aria-current={u.id === id} onClick={() => setId(u.id)}>
            {u.name}
          </button>
        ))}
      </div>
      <UniverseList store={store} data={data} universe={universe} />
    </>
  );
}

function UniverseList({ store, data, universe }: { store: Store; data: Dataset; universe: Universe }) {
  const [showAll, setShowAll] = useState(false);
  const watched = universe.order.filter((i) => i.watched).length;
  const nextIndex = universe.order.findIndex((i) => !i.watched);
  const entry = data.shows.find((s) => s.id === universe.entryShowId);

  // A 818-entry list is unusable in full, so anchor on where you actually are.
  const window = useMemo(() => {
    if (showAll) return universe.order.map((item, index) => ({ item, index }));
    const start = Math.max(0, (nextIndex === -1 ? universe.order.length : nextIndex) - 5);
    return universe.order
      .map((item, index) => ({ item, index }))
      .slice(start, start + 40);
  }, [nextIndex, showAll, universe.order]);

  function setWatched(index: number, value: boolean) {
    store.dispatch({ type: "universeItem", universeId: universe.id, index, watched: value });
  }

  /** Tick everything up to and including this entry — the usual way to catch up. */
  function catchUpTo(index: number) {
    const ops = universe.order
      .map((item, i) => ({ item, i }))
      .filter(({ item, i }) => i <= index && !item.watched)
      .map(({ i }) => ({ type: "universeItem" as const, universeId: universe.id, index: i, watched: true }));
    store.dispatch(...ops);
  }

  return (
    <>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="stack">
            <strong>{universe.name}</strong>
            <span className="small muted">
              {watched} of {universe.order.length} watched
              {entry && ` · ${data.people.reduce((sum, p) => sum + (entry.votes.weekly?.[p] ?? 0) + (entry.votes.hour?.[p] ?? 0), 0)} points backing it`}
            </span>
          </div>
          <button onClick={() => setShowAll(!showAll)}>{showAll ? "Jump to where we are" : "Show the whole order"}</button>
        </div>
        <div className="meter" style={{ marginTop: 10 }}>
          <div style={{ width: `${(watched / universe.order.length) * 100}%` }} />
        </div>
        {nextIndex >= 0 && (
          <p className="small" style={{ marginBottom: 0 }}>
            Up next: <strong>{universe.order[nextIndex].label}</strong>
          </p>
        )}
      </div>

      <div className="panel scroll">
        <table>
          <tbody>
            {window.map(({ item, index }) => (
              <tr key={index} className={index === nextIndex ? "voted" : undefined}>
                <td style={{ width: 34 }} className="muted small">{index + 1}</td>
                <td>
                  <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={item.watched}
                      onChange={(e) => setWatched(index, e.target.checked)}
                    />
                    <span style={{ textDecoration: item.watched ? "line-through" : undefined, opacity: item.watched ? 0.55 : 1 }}>
                      {item.label}
                    </span>
                  </label>
                </td>
                <td className="num">
                  {/* Only worth offering when there is a backlog to sweep up. */}
                  {!item.watched && index > nextIndex && (
                    <button className="small" onClick={() => catchUpTo(index)} title="Tick this and everything before it">
                      Caught up to here
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
