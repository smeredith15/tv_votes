import { memo, useMemo, useState } from "react";
import { DrawError, drawWinner, spinTitles, tickets, totalWeight } from "../lib/draw";
import { LEDGERS, ballotFor, effectiveSpent, episodesPerWeek, isEligible, strandedPoints, strandedShows } from "../lib/ledgers";
import { EVERYONE, type Store } from "../lib/store";
import type { Dataset, Draw, LedgerId, Show } from "../lib/types";
import { DrawWheel } from "./DrawWheel";
import { ProviderTags, StatusPill } from "./ShowBits";

interface Props {
  store: Store;
  data: Dataset;
}

/** Rows drawn at once. The rest are a click away rather than all at once. */
const PAGE = 50;

export function VoteView({ store, data }: Props) {
  const [ledger, setLedger] = useState<LedgerId>("half");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [result, setResult] = useState<Draw | null>(null);
  const [spin, setSpin] = useState<{ teasers: string[]; draw: Draw } | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const { voter } = store.settings;
  const sealed = voter !== EVERYONE;
  const hidden = (person: string) => sealed && person !== voter;

  const ledgerInfo = LEDGERS.find((l) => l.id === ledger)!;
  const spends = data.people.map((person) => ({
    person,
    // What the draw will use. Points on a finished show are not part of it.
    spent: effectiveSpent(data, ledger, person),
    stranded: strandedPoints(data, ledger, person),
  }));
  const stuck = strandedShows(data, ledger);
  const highest = Math.max(0, ...spends.map((s) => s.spent));
  const balanced = spends.every((s) => s.spent === spends[0].spent);
  const pool = tickets(data, ledger);
  // Eligible only, so this count matches the rows actually listed below.
  const ownBacked = data.shows.filter(
    (show) => (show.votes[ledger]?.[voter] ?? 0) > 0 && isEligible(show, ledger),
  );

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const backers = sealed ? [voter] : data.people;
    const weigh = (show: Show) => backers.reduce((sum, p) => sum + (show.votes[ledger]?.[p] ?? 0), 0);

    // Every show this ballot could land on, backed ones first. It used to list
    // only what already had points, which meant nothing could be found without
    // knowing its name first.
    return data.shows
      .filter((show) => isEligible(show, ledger))
      .filter((show) => !needle || show.title.toLowerCase().includes(needle))
      .sort((a, b) => weigh(b) - weigh(a) || a.title.localeCompare(b.title));
  }, [data.people, data.shows, ledger, query, sealed, voter]);

  const visible = candidates.slice(0, limit);

  /**
   * Settle the draw first, then spin. Nothing is written to history until one
   * of you says to keep it, so a curiosity draw costs nothing.
   */
  function roll() {
    setDrawError(null);
    setResult(null);
    try {
      const draw = drawWinner(data, ledger);
      setSpin({ teasers: spinTitles(data, ledger, 4), draw });
    } catch (e) {
      setSpin(null);
      setDrawError(e instanceof DrawError ? e.message : String(e));
    }
  }

  function keep(draw: Draw) {
    store.dispatch({ type: "draw", draw });
    setResult(null);
  }

  return (
    <>
      <div className="panel" style={{ marginTop: 14, marginBottom: 0 }}>
        <div className="row">
          <strong className="small">Who's voting?</strong>
          {data.people.map((person) => (
            <button
              key={person}
              aria-current={voter === person}
              onClick={() => store.setSettings({ ...store.settings, voter: person })}
            >
              {data.displayNames?.[person] ?? person}
            </button>
          ))}
          <button
            aria-current={voter === EVERYONE}
            onClick={() => store.setSettings({ ...store.settings, voter: EVERYONE })}
          >
            Both
          </button>
          <span className="small muted">
            {sealed
              ? `Only ${data.displayNames?.[voter] ?? voter} can see and change points right now.`
              : "Everything is visible — pick a name to hide the other's points."}
          </span>
        </div>
      </div>

      <nav className="row" style={{ marginTop: 14 }}>
        {LEDGERS.map((l) => (
          <button key={l.id} aria-current={ledger === l.id} onClick={() => { setLedger(l.id); setResult(null); }}>
            {l.name}
          </button>
        ))}
      </nav>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="stack">
            <strong>{ledgerInfo.name}</strong>
            <span className="muted small">{ledgerInfo.blurb}</span>
          </div>
          <div className="stack" style={{ alignItems: "flex-end" }}>
            {sealed ? (
              // The combined total would give away the hidden one by subtraction.
              <span className="small muted">{ownBacked.length} shows you are backing</span>
            ) : (
              <>
                <span className="small muted">{pool.length} shows in the hat</span>
                <span className="small muted">{totalWeight(data, ledger).toLocaleString()} total tickets</span>
              </>
            )}
          </div>
        </div>

        <div className="grid" style={{ marginTop: 12 }}>
          {spends.map(({ person, spent }) => {
            const concealed = hidden(person);
            // There is no target to spend up to — the bars are drawn against
            // whichever of you has spent more, because all that matters is
            // that the two end up the same.
            const share = highest > 0 ? (spent / highest) * 100 : 0;
            return (
              <div key={person} className="stack">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>{data.displayNames?.[person] ?? person}</span>
                  <span className="small muted">
                    {concealed ? "hidden" : `${spent.toLocaleString()} points`}
                  </span>
                </div>
                <div className={`meter${!concealed && spent < highest ? " short" : ""}`}>
                  <div style={{ width: `${concealed ? 0 : share}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {stuck.length > 0 && spends.some((s) => s.stranded > 0 && !hidden(s.person)) && (
          <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
            <p className="small muted" style={{ margin: 0, flex: "1 1 300px" }}>
              {spends
                .filter((s) => s.stranded > 0 && !hidden(s.person))
                .map((s) => `${data.displayNames?.[s.person] ?? s.person} has ${s.stranded}`)
                .join(" and ")}{" "}
              points on {stuck.length === 1 ? stuck[0].title : `${stuck.length} shows`} with nothing left
              to watch. Those points are already out of the draw — taking them back lets you place them
              on something that can still win.
            </p>
            <button
              className="small"
              onClick={() =>
                store.dispatch(
                  ...stuck.map((show) => ({ type: "freePoints" as const, showId: show.id, ledger })),
                )
              }
            >
              Take them back
            </button>
          </div>
        )}

        {!balanced && (
          <p className="banner" style={{ marginTop: 12 }}>
            {sealed ? (
              <>You two have not spent the same number of points. Switch to Both to see where.</>
            ) : (
              <>
                Cheater — {spends.map((s) => `${data.displayNames?.[s.person] ?? s.person} ${s.spent}`).join(" vs ")}.
                {" "}
                {spends
                  .filter((s) => s.spent < highest)
                  .map((s) => `${data.displayNames?.[s.person] ?? s.person} has ${highest - s.spent} left to place`)
                  .join(", ")}
                .
              </>
            )}
          </p>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={roll} disabled={!balanced || pool.length === 0 || spin !== null}>
            {spin ? "Drawing…" : "Draw a winner"}
          </button>
          <input
            placeholder={`Search the ${candidates.length.toLocaleString()} shows on this ballot…`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            style={{ flex: "1 1 220px" }}
          />
        </div>
        {drawError && <p className="banner" style={{ marginTop: 10 }}>{drawError}</p>}
      </div>

      {spin && (
        <DrawWheel
          teasers={spin.teasers}
          winner={spin.draw.winnerTitle}
          onSettled={() => {
            setResult(spin.draw);
            setSpin(null);
          }}
        />
      )}

      {result && (
        <WinnerCard
          data={data}
          draw={result}
          recorded={data.history.some((d) => d.id === result.id)}
          onKeep={() => keep(result)}
          onDiscard={() => setResult(null)}
        />
      )}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Show</th>
              <th className="hide-sm">On the ballot for</th>
              {data.people.map((p) => (
                <th key={p} className="num">{data.displayNames?.[p] ?? p}</th>
              ))}
              <th className="num">Tickets</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((show) => (
              <VoteRow
                key={show.id}
                show={show}
                ledger={ledger}
                people={data.people}
                displayNames={data.displayNames}
                hidden={hidden}
                sealed={sealed}
                dispatch={store.dispatch}
              />
            ))}
            {candidates.length === 0 && (
              <tr>
                <td colSpan={data.people.length + 3} className="muted">
                  {query ? "Nothing matches." : "Nothing is eligible for this ballot yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {candidates.length > visible.length && (
          <button className="small" style={{ marginTop: 10 }} onClick={() => setLimit(limit + PAGE * 3)}>
            Show more ({(candidates.length - visible.length).toLocaleString()} to go)
          </button>
        )}
      </div>
    </>
  );
}

interface RowProps {
  show: Show;
  ledger: LedgerId;
  people: string[];
  displayNames?: Record<string, string>;
  hidden: (person: string) => boolean;
  sealed: boolean;
  dispatch: Store["dispatch"];
}

const VoteRow = memo(function VoteRow({
  show,
  ledger,
  people,
  hidden,
  sealed,
  dispatch,
}: RowProps) {
  const weight = people.reduce((sum, p) => sum + (show.votes[ledger]?.[p] ?? 0), 0);
  const ballot = ballotFor(show, ledger);

  return (
    <tr className={weight > 0 ? "voted" : undefined}>
      <td>
        <div className="stack">
          <span>{show.title}</span>
          <span className="row small" style={{ gap: 6 }}>
            <StatusPill show={show} />
            <ProviderTags show={show} limit={2} />
          </span>
        </div>
      </td>
      <td className="hide-sm small muted">
        {ballot.label}
        {ledger === "weekly" && ` · ${episodesPerWeek(show)} ep/week`}
      </td>
      {people.map((person) => (
        <td key={person} className="num">
          {hidden(person) ? (
            <span className="muted">—</span>
          ) : (
            <input
              className="points"
              type="number"
              min={0}
              value={show.votes[ledger]?.[person] ?? 0}
              onChange={(e) =>
                dispatch({
                  type: "vote",
                  showId: show.id,
                  ledger,
                  person,
                  points: Math.max(0, Math.round(Number(e.target.value) || 0)),
                })
              }
            />
          )}
        </td>
      ))}
      <td className="num">{sealed ? "—" : weight.toLocaleString()}</td>
    </tr>
  );
});

interface WinnerProps {
  data: Dataset;
  draw: Draw;
  recorded: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}

function WinnerCard({ data, draw, recorded, onKeep, onDiscard }: WinnerProps) {
  const show = data.shows.find((s) => s.id === draw.winnerId);
  const odds = ((draw.standings.find((s) => s.id === draw.winnerId)?.weight ?? 0) / draw.totalWeight) * 100;
  return (
    <div className="winner">
      <div className="small muted">Ticket {draw.roll.toLocaleString()} of {draw.totalWeight.toLocaleString()}</div>
      <div className="title">{draw.winnerTitle}</div>
      <div className="small">{draw.ballot} · {odds.toFixed(1)}% chance</div>
      {show && (
        <div className="row small" style={{ justifyContent: "center", marginTop: 10 }}>
          <StatusPill show={show} />
          <ProviderTags show={show} />
        </div>
      )}

      {recorded ? (
        <p className="small muted" style={{ marginBottom: 0 }}>Kept — it is in the history.</p>
      ) : (
        <>
          <div className="row draw-actions">
            <button className="primary" onClick={onKeep}>Keep it</button>
            <button onClick={onDiscard}>Just curious — forget it</button>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Nothing is written down until you keep it.
          </p>
        </>
      )}
    </div>
  );
}
