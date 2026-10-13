import { memo, useEffect, useMemo, useState } from "react";
import { DrawError, drawWinner, spinTitles, tickets, totalWeight } from "../lib/draw";
import {
  LEDGERS,
  ballotFor,
  effectiveSpent,
  episodesPerWeek,
  isEligible,
  strandedPoints,
  strandedReason,
  strandedShows,
} from "../lib/ledgers";
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
  /**
   * Bumped each time the queue empties — a save, a discard, or opening the
   * page with nothing waiting. Only then is it safe to sort the ballot again.
   * Reading store.pending directly is not enough: the first keystroke takes it
   * from 0 to 1, which is itself a change, and the order would shift under the
   * box being typed into.
   */
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (store.pending === 0) setSettled((n) => n + 1);
  }, [store.pending]);
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

  /**
   * Where each show sits, fixed until the ballot itself changes.
   *
   * Sorting by points as they are typed makes a row bolt down the list the
   * moment a field is cleared to retype it — often past the end of what is
   * drawn, so the box being typed into simply vanishes. The order is taken
   * once and held: on opening a ballot, on switching who is voting, and once
   * changes are saved.
   */
  const ranks = useMemo(() => {
    const backers = sealed ? [voter] : data.people;
    const weigh = (show: Show) => backers.reduce((sum, p) => sum + (show.votes[ledger]?.[p] ?? 0), 0);
    const ordered = data.shows
      .filter((show) => isEligible(show, ledger))
      .sort((a, b) => weigh(b) - weigh(a) || a.title.localeCompare(b.title));
    return new Map(ordered.map((show, index) => [show.id, index]));
    // The vote values are left out on purpose: depending on them is the bug.
  }, [ledger, sealed, voter, settled]);

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rank = (show: Show) => ranks.get(show.id) ?? Number.MAX_SAFE_INTEGER;

    // Every show this ballot could land on, in the order settled above. A show
    // added since then has no rank and goes to the end, alphabetically.
    return data.shows
      .filter((show) => isEligible(show, ledger))
      .filter((show) => !needle || show.title.toLowerCase().includes(needle))
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }, [data.shows, ledger, query, ranks]);

  const visible = candidates.slice(0, limit);

  const universeNames = useMemo(
    () => new Map(data.universes.map((u) => [u.id, u.name])),
    [data.universes],
  );

  /** A universe has no seasons; what it offers is the next item in its order. */
  const universeNext = useMemo(() => {
    const next = new Map<string, string>();
    for (const universe of data.universes) {
      const item = universe.order.find((entry) => !entry.watched);
      next.set(universe.id, item ? `Next: ${item.label}` : "Nothing left in the order");
    }
    return next;
  }, [data.universes]);

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
          <Stranded
            shows={stuck}
            ledger={ledger}
            people={data.people}
            displayNames={data.displayNames}
            universeNames={universeNames}
            hidden={hidden}
            dispatch={store.dispatch}
          />
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
              {data.people.map((p) => (
                <th key={p} className="num">{data.displayNames?.[p] ?? p}</th>
              ))}
              <th className="num hide-sm">Tickets</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((show) => (
              <VoteRow
                key={show.id}
                show={show}
                ledger={ledger}
                universeNext={show.universeEntry ? universeNext.get(show.universe ?? "") : undefined}
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

/**
 * Points sitting where they cannot win.
 *
 * It used to give a count and no names, for shows the ballot hides — so there
 * was no way to see what it was talking about, and it blamed all of them on
 * being watched when some were simply the wrong length for this ballot.
 */
function Stranded({
  shows,
  ledger,
  people,
  displayNames,
  universeNames,
  hidden,
  dispatch,
}: {
  shows: Show[];
  ledger: LedgerId;
  people: string[];
  displayNames?: Record<string, string>;
  universeNames: Map<string, string>;
  hidden: (person: string) => boolean;
  dispatch: Store["dispatch"];
}) {
  const [open, setOpen] = useState(false);
  const name = (person: string) => displayNames?.[person] ?? person;
  const held = (show: Show, person: string) => show.votes[ledger]?.[person] ?? 0;

  return (
    <div className="stranded">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="small muted" style={{ margin: 0, flex: "1 1 260px" }}>
          {people
            .filter((person) => !hidden(person) && shows.some((show) => held(show, person) > 0))
            .map((person) => `${name(person)} has ${shows.reduce((sum, s) => sum + held(s, person), 0)}`)
            .join(" and ")}{" "}
          points on {shows.length} show{shows.length === 1 ? "" : "s"} this ballot cannot land on. They
          count for nothing where they are.
        </p>
        <button className="small" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Which?"}
        </button>
      </div>

      {open && (
        <table style={{ marginTop: 8 }}>
          <tbody>
            {shows.map((show) => (
              <tr key={show.id}>
                <td>
                  <div className="stack">
                    <span className="small">{show.title}</span>
                    <span className="small muted">
                      {strandedReason(show, ledger, universeNames.get(show.universe ?? ""))}
                    </span>
                  </div>
                </td>
                <td className="num small muted">
                  {people
                    .filter((person) => !hidden(person) && held(show, person) > 0)
                    .map((person) => `${name(person)} ${held(show, person)}`)
                    .join(", ")}
                </td>
                <td className="num">
                  <button
                    className="small"
                    onClick={() => dispatch({ type: "freePoints", showId: show.id, ledger })}
                  >
                    Take back
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        className="small"
        style={{ marginTop: 8 }}
        onClick={() =>
          dispatch(...shows.map((show) => ({ type: "freePoints" as const, showId: show.id, ledger })))
        }
      >
        Take back all {shows.length}
      </button>
    </div>
  );
}

/**
 * A points box that lets itself be emptied.
 *
 * Bound straight to the stored number, clearing it to type a new one wrote a
 * zero on the first keystroke and put a 0 back in the box. While it has focus
 * the box keeps whatever has been typed, including nothing at all, and an empty
 * box only becomes a zero when you leave it.
 */
function PointsInput({ value, onChange }: { value: number; onChange: (points: number) => void }) {
  const [typed, setTyped] = useState<string | null>(null);

  return (
    <input
      className="points"
      type="number"
      min={0}
      inputMode="numeric"
      value={typed ?? String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const text = e.target.value;
        setTyped(text);
        if (text !== "") {
          const points = Number(text);
          if (Number.isFinite(points)) onChange(Math.max(0, Math.round(points)));
        }
      }}
      onBlur={() => {
        if (typed === "") onChange(0);
        setTyped(null);
      }}
    />
  );
}

interface RowProps {
  show: Show;
  ledger: LedgerId;
  /** For a universe, the next thing in its order — it has no seasons of its own. */
  universeNext?: string;
  people: string[];
  displayNames?: Record<string, string>;
  hidden: (person: string) => boolean;
  sealed: boolean;
  dispatch: Store["dispatch"];
}

const VoteRow = memo(function VoteRow({
  show,
  ledger,
  universeNext,
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
            <span className="pill ballot">
              {universeNext ?? ballot.label}
              {ledger === "weekly" && ballot.seasons.length > 0 && `, ${episodesPerWeek(show)}/week`}
            </span>
            <StatusPill show={show} />
            <ProviderTags show={show} limit={2} />
          </span>
        </div>
      </td>
      {people.map((person) => (
        <td key={person} className="num">
          {hidden(person) ? (
            <span className="muted">—</span>
          ) : (
            <PointsInput
              value={show.votes[ledger]?.[person] ?? 0}
              onChange={(points) => dispatch({ type: "vote", showId: show.id, ledger, person, points })}
            />
          )}
        </td>
      ))}
      <td className="num hide-sm">{sealed ? "—" : weight.toLocaleString()}</td>
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
