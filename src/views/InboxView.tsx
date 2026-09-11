import { IMAGE_BASE } from "../../scripts/tmdb.mjs";
import type { Store } from "../lib/store";
import type { Dataset, InboxItem, Show } from "../lib/types";

/**
 * New premieres queue up here. Nothing reaches a ballot until one of you says
 * yes, so the list stays yours rather than filling with everything that airs.
 */
export function InboxView({ store, data }: { store: Store; data: Dataset }) {
  if (data.inbox.length === 0) {
    return (
      <div className="panel">
        <strong>Nothing waiting</strong>
        <p className="small muted" style={{ marginBottom: 0 }}>
          The nightly job queues newly premiered shows here for you to accept or dismiss.
        </p>
      </div>
    );
  }

  function decide(item: InboxItem, accept: boolean) {
    store.dispatch({
      type: "inbox",
      tmdbId: item.tmdbId,
      accept,
      show: accept ? toShow(item, data) : undefined,
    });
  }

  return (
    <>
      <p className="small muted">{data.inbox.length} shows waiting on a yes or no.</p>
      {data.inbox.map((item) => (
        <div className="panel" key={item.tmdbId}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            {item.poster && (
              <img src={IMAGE_BASE + item.poster} alt="" width={60} height={90} style={{ borderRadius: 6 }} />
            )}
            <div className="stack" style={{ flex: "1 1 240px" }}>
              <strong>{item.title}</strong>
              <span className="small muted">
                {[item.network, item.firstAirDate?.slice(0, 4), item.runtime === 30 ? "half-hour" : item.runtime === 60 ? "hour-long" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="small">{item.overview}</span>
            </div>
            <div className="stack">
              <button className="primary" onClick={() => decide(item, true)}>Add it</button>
              <button onClick={() => decide(item, false)}>No thanks</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function toShow(item: InboxItem, data: Dataset): Show {
  const id = item.title
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    id,
    title: item.title,
    runtime: item.runtime,
    format: "series",
    franchise: null,
    universe: null,
    status: "returning",
    tmdbId: item.tmdbId,
    poster: item.poster ?? null,
    providers: [],
    providersUpdated: null,
    seasons: [],
    votes: Object.fromEntries(
      (["weekly", "hour", "half", "mini"] as const).map((l) => [l, Object.fromEntries(data.people.map((p) => [p, 0]))]),
    ) as Show["votes"],
    addedAt: new Date().toISOString(),
  };
}
