import { LEDGERS, totalSpent } from "../lib/ledgers";
import { RepoPanel } from "./RepoPanel";
import type { Store } from "../lib/store";
import type { Dataset } from "../lib/types";

export function SettingsView({ store, data }: { store: Store; data: Dataset }) {
  const { settings, setSettings } = store;

  return (
    <>
      <RepoPanel store={store} />

      <div className="panel">
        <strong>TMDB</strong>
        <p className="small muted">
          Needed for streaming sources, season lists, and whether a show is returning. The nightly job uses the
          repo secret; this key is only for the “Refresh from TMDB” button on a single show.
        </p>
        <div className="grid">
          <label className="stack small">
            <span className="muted">API key</span>
            <input
              type="password"
              value={settings.tmdbKey}
              onChange={(e) => setSettings({ ...settings, tmdbKey: e.target.value })}
            />
          </label>
          <label className="stack small">
            <span className="muted">Streaming region</span>
            <input
              value={settings.region}
              onChange={(e) => setSettings({ ...settings, region: e.target.value.toUpperCase() })}
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <strong>Point budgets</strong>
        <p className="small muted">How many points each of you gets to spend on each ballot.</p>
        <table>
          <thead>
            <tr>
              <th>Ballot</th>
              <th className="num">Budget</th>
              {data.people.map((p) => (
                <th key={p} className="num">{data.displayNames?.[p] ?? p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEDGERS.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td className="num">
                  <input
                    className="points"
                    type="number"
                    min={0}
                    value={data.budgets[l.id] ?? 0}
                    onChange={(e) =>
                      store.dispatch({ type: "budget", ledger: l.id, points: Number(e.target.value) || 0 })
                    }
                  />
                </td>
                {data.people.map((p) => (
                  <td key={p} className="num small muted">{totalSpent(data, l.id, p).toLocaleString()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
