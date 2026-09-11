import { useMemo, useState } from "react";
import { verifyDraw } from "../lib/draw";
import { neverPicked, showRecords } from "../lib/history";
import { LEDGERS } from "../lib/ledgers";
import { longestDrought, personStats, watchTotals } from "../lib/stats";
import type { Store } from "../lib/store";
import type { Dataset, Draw, LedgerId } from "../lib/types";

export function HistoryView({ store, data }: { store: Store; data: Dataset }) {
  const [ledger, setLedger] = useState<LedgerId | "all">("all");
  const [confirmingClear, setConfirmingClear] = useState(false);

  const draws = useMemo(
    () => [...data.history].filter((d) => ledger === "all" || d.ledger === ledger).reverse(),
    [data.history, ledger],
  );
  const bridesmaids = useMemo(
    () => neverPicked(data, ledger === "all" ? undefined : ledger).slice(0, 25),
    [data, ledger],
  );
  const records = useMemo(() => showRecords(data.history), [data.history]);

  return (
    <>
      <div className="panel">
        <div className="row">
          <button aria-current={ledger === "all"} onClick={() => setLedger("all")}>All ballots</button>
          {LEDGERS.map((l) => (
            <button key={l.id} aria-current={ledger === l.id} onClick={() => setLedger(l.id)}>
              {l.name}
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {data.history.length === 0
              ? "No draws recorded yet — the workbook kept no history, so this starts with your first draw in the app."
              : `${data.history.length} draw${data.history.length === 1 ? "" : "s"} recorded across ${records.size} shows.`}
          </p>
          {data.history.length > 0 &&
            (confirmingClear ? (
              <span className="row small">
                <span className="muted">Erase all {data.history.length}?</span>
                <button
                  onClick={() => {
                    store.dispatch({ type: "clearHistory" });
                    setConfirmingClear(false);
                  }}
                >
                  Yes, clear it
                </button>
                <button onClick={() => setConfirmingClear(false)}>Cancel</button>
              </span>
            ) : (
              <button className="small" onClick={() => setConfirmingClear(true)}>
                Clear all history
              </button>
            ))}
        </div>
      </div>

      <StatsPanel data={data} ledger={ledger === "all" ? undefined : ledger} />

      {bridesmaids.length > 0 && (
        <div className="panel">
          <strong>Always a bridesmaid</strong>
          <p className="small muted">Shows you keep backing that have never won a draw.</p>
          <table>
            <thead>
              <tr>
                <th>Show</th>
                <th className="num">On the ballot</th>
                <th className="num">Best finish</th>
                <th className="num">Points sunk</th>
              </tr>
            </thead>
            <tbody>
              {bridesmaids.map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td className="num">{r.appearances}×</td>
                  <td className="num">{r.bestPlace === null ? "—" : `#${r.bestPlace}`}</td>
                  <td className="num">{r.lifetimePoints.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draws.map((draw) => (
        <DrawCard
          key={draw.id}
          data={data}
          draw={draw}
          onForget={() => store.dispatch({ type: "forgetDraw", drawId: draw.id })}
        />
      ))}
    </>
  );
}

/**
 * The numbers worth knowing. Win share splits the credit for each winner by
 * how much of it each of you paid for, so a show you both backed does not
 * count as a whole win for either.
 */
function Tally({ count, one, many }: { count: number; one: string; many: string }) {
  return (
    <span>
      <strong>{count.toLocaleString()}</strong> {count === 1 ? one : many}
    </span>
  );
}

function StatsPanel({ data, ledger }: { data: Dataset; ledger?: LedgerId }) {
  const stats = personStats(data.history, data.people, ledger);
  const totals = watchTotals(data);
  const drought = longestDrought(ledger ? data.history.filter((d) => d.ledger === ledger) : data.history);
  const draws = ledger ? data.history.filter((d) => d.ledger === ledger).length : data.history.length;

  return (
    <div className="panel">
      <strong>How it is going</strong>

      <div className="grid" style={{ marginTop: 10 }}>
        {stats.map((s) => {
          const running = s.winShare - s.spendShare;
          return (
            <div key={s.person} className="stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong className="small">{data.displayNames?.[s.person] ?? s.person}</strong>
                <span className="small muted">
                  {s.winShare.toFixed(1)} of {draws} win{draws === 1 ? "" : "s"}
                </span>
              </div>
              <div className="meter">
                <div style={{ width: `${draws > 0 ? Math.min(100, (s.winShare / draws) * 100) : 0}%` }} />
              </div>
              <span className="small muted">
                backed the winner {s.backedWinner}×, shut out {s.shutOut}×
                {draws > 1 && Math.abs(running) >= 0.5 && (running > 0 ? " · running hot" : " · running cold")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="row small muted" style={{ marginTop: 14, gap: 16 }}>
        <Tally count={totals.episodesWatched} one="episode watched" many="episodes watched" />
        <Tally count={totals.seasonsWatched} one="season" many="seasons" />
        <Tally count={totals.showsFinished} one="show finished" many="shows finished" />
        <Tally count={totals.showsInProgress} one="show part-watched" many="shows part-watched" />
        {totals.universeItemsWatched > 0 && (
          <Tally count={totals.universeItemsWatched} one="universe entry" many="universe entries" />
        )}
      </div>

      {drought && (
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Longest wait: <strong>{drought.title}</strong> has been on the ballot {drought.draws}{" "}
          {drought.draws === 1 ? "draw" : "draws"} without ever winning.
        </p>
      )}

      {draws < 3 && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          These will mean more after a few more draws — over one or two, it is all luck.
        </p>
      )}
    </div>
  );
}

function DrawCard({ data, draw, onForget }: { data: Dataset; draw: Draw; onForget: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ledgerName = LEDGERS.find((l) => l.id === draw.ledger)?.name ?? draw.ledger;
  const honest = verifyDraw(draw);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="stack">
          <strong>{draw.winnerTitle}</strong>
          <span className="small muted">
            {ledgerName} · {new Date(draw.drawnAt).toLocaleDateString()} · {draw.ballot}
          </span>
        </div>
        <div className="stack" style={{ alignItems: "flex-end" }}>
          <span className="small muted">
            ticket {draw.roll.toLocaleString()} / {draw.totalWeight.toLocaleString()}
          </span>
          <span className={`pill${honest ? " returning" : ""}`} title={`seed ${draw.seed}`}>
            {honest ? "Verified" : "Does not replay"}
          </span>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button className="small" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"} the {draw.standings.length} shows in that draw
        </button>
        {confirming ? (
          <span className="row small">
            <span className="muted">Delete this draw?</span>
            <button onClick={onForget}>Yes</button>
            <button onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        ) : (
          <button className="small" onClick={() => setConfirming(true)}>Delete</button>
        )}
      </div>

      {open && (
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Show</th>
              {data.people.map((p) => (
                <th key={p} className="num">{data.displayNames?.[p] ?? p}</th>
              ))}
              <th className="num">Odds</th>
            </tr>
          </thead>
          <tbody>
            {draw.standings.map((entry) => (
              <tr key={entry.id} className={entry.id === draw.winnerId ? "voted" : undefined}>
                <td>{entry.title}</td>
                {data.people.map((p) => (
                  <td key={p} className="num">{draw.allocations[p]?.[entry.id] ?? 0}</td>
                ))}
                <td className="num">{((entry.weight / draw.totalWeight) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
