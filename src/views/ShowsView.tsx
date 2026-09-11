import { useEffect, useMemo, useRef, useState } from "react";
import { LEDGERS, eligibleLedgers, watchState } from "../lib/ledgers";
import type { Store } from "../lib/store";
import type { Dataset, LedgerId, Show } from "../lib/types";
import { AddShow } from "./AddShow";
import { Poster, ProviderTags, StatusPill } from "./ShowBits";
import { ShowDetail } from "./ShowDetail";

type Filter = "all" | "returning" | "in_progress" | "started" | "unmatched" | LedgerId;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "returning", label: "Returning" },
  { id: "in_progress", label: "Part-watched" },
  { id: "started", label: "Needs seasons ticked" },
  { id: "unmatched", label: "No TMDB match" },
  ...LEDGERS.map((l) => ({ id: l.id as Filter, label: l.name })),
];

export function ShowsView({ store, data }: { store: Store; data: Dataset }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [service, setService] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const services = useMemo(() => {
    const names = new Set<string>();
    for (const show of data.shows) {
      for (const p of show.providers) if (p.type === "flatrate") names.add(p.name);
    }
    return [...names].sort();
  }, [data.shows]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.shows.filter((show) => {
      if (needle && !show.title.toLowerCase().includes(needle)) return false;
      if (service && !show.providers.some((p) => p.name === service)) return false;
      switch (filter) {
        case "returning":
          return show.status === "returning";
        case "in_progress":
          return watchState(show) === "in_progress";
        case "started":
          return show.startedNotFinished === true && watchState(show) === "unwatched";
        case "unmatched":
          return show.tmdbId === null;
        case "all":
          return true;
        default:
          return eligibleLedgers(show).includes(filter);
      }
    });
  }, [data.shows, filter, query, service]);

  const current = selected ? data.shows.find((s) => s.id === selected) ?? null : null;
  const detail = useRef<HTMLDivElement>(null);

  // The panel opens above a long list, so a show picked from further down would
  // otherwise open off-screen and look as though the click had done nothing.
  useEffect(() => {
    if (current) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [current]);

  return (
    <>
      <div className="panel">
        <div className="row">
          <input
            placeholder={`Search ${data.shows.length.toLocaleString()} shows…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: "1 1 240px" }}
          />
          <button onClick={() => setAdding(!adding)}>{adding ? "Done adding" : "Add a show"}</button>
          <select value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">Any service</option>
            {services.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {FILTERS.map((f) => (
            <button key={f.id} aria-current={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>{shown.length.toLocaleString()} shows</p>
      </div>

      {adding && (
        <AddShow
          store={store}
          data={data}
          onAdded={(id) => {
            setSelected(id);
            setQuery("");
          }}
        />
      )}

      <div ref={detail}>
        {current && <ShowDetail store={store} data={data} show={current} onClose={() => setSelected(null)} />}
      </div>

      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th colSpan={2}>Show</th>
              <th className="hide-sm">Streaming</th>
              <th className="num">Seasons</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 300).map((show) => (
              <ShowRow key={show.id} show={show} onOpen={() => setSelected(show.id)} />
            ))}
          </tbody>
        </table>
        {shown.length > 300 && (
          <p className="small muted">Showing the first 300 — narrow it with the search box.</p>
        )}
      </div>
    </>
  );
}

function ShowRow({ show, onOpen }: { show: Show; onOpen: () => void }) {
  const watched = show.seasons.filter((s) => s.watched).length;
  return (
    <tr>
      <td style={{ width: 40 }}>
        <Poster show={show} size={32} />
      </td>
      <td>
        <button
          onClick={onOpen}
          style={{ border: "none", background: "none", padding: 0, textAlign: "left", fontWeight: 500 }}
        >
          {show.title}
        </button>
        <div className="row small" style={{ gap: 6, marginTop: 2 }}>
          <StatusPill show={show} />
          {show.universe && <span className="pill universe">{show.universe}</span>}
        </div>
      </td>
      <td className="hide-sm small">
        <ProviderTags show={show} limit={3} />
      </td>
      <td className="num small muted">
        {show.seasons.length ? `${watched}/${show.seasons.length}` : "—"}
      </td>
    </tr>
  );
}
