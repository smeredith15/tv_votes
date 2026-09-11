import { useState } from "react";
import { checkToken } from "../lib/github";
import { LEDGERS, totalSpent } from "../lib/ledgers";
import type { Store } from "../lib/store";
import type { Dataset } from "../lib/types";

export function SettingsView({ store, data }: { store: Store; data: Dataset }) {
  const { settings, setSettings } = store;
  const [tokenState, setTokenState] = useState<string | null>(null);

  async function verify() {
    setTokenState("Checking…");
    const result = await checkToken(settings.repo);
    setTokenState(result.detail);
  }

  return (
    <>
      <div className="panel">
        <strong>Who is at this device?</strong>
        <div className="row" style={{ marginTop: 8 }}>
          {data.people.map((person) => (
            <button
              key={person}
              aria-current={settings.me === person}
              onClick={() => setSettings({ ...settings, me: person })}
            >
              {data.displayNames?.[person] ?? person}
            </button>
          ))}
        </div>
        <label className="row small" style={{ marginTop: 12, gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.sealed}
            onChange={(e) => setSettings({ ...settings, sealed: e.target.checked })}
          />
          <span>
            Sealed voting — hide the other person's points so neither of you can counter-bid.
          </span>
        </label>
      </div>

      <div className="panel">
        <strong>Saving to GitHub</strong>
        <p className="small muted">
          Votes are saved as commits to <code>{settings.repo.owner}/{settings.repo.repo}</code>. Create a
          fine-grained personal access token with <em>Contents: read and write</em> on that repo and paste it
          here. It is kept in this browser only, and never leaves it except to talk to GitHub.
        </p>
        <div className="grid">
          <label className="stack small">
            <span className="muted">Owner</span>
            <input
              value={settings.repo.owner}
              onChange={(e) => setSettings({ ...settings, repo: { ...settings.repo, owner: e.target.value } })}
            />
          </label>
          <label className="stack small">
            <span className="muted">Repo</span>
            <input
              value={settings.repo.repo}
              onChange={(e) => setSettings({ ...settings, repo: { ...settings.repo, repo: e.target.value } })}
            />
          </label>
          <label className="stack small">
            <span className="muted">Branch</span>
            <input
              value={settings.repo.branch}
              onChange={(e) => setSettings({ ...settings, repo: { ...settings.repo, branch: e.target.value } })}
            />
          </label>
          <label className="stack small">
            <span className="muted">Token</span>
            <input
              type="password"
              placeholder="github_pat_…"
              value={settings.repo.token}
              onChange={(e) => setSettings({ ...settings, repo: { ...settings.repo, token: e.target.value } })}
            />
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => void verify()} disabled={!settings.repo.token}>Test the token</button>
          {tokenState && <span className="small muted">{tokenState}</span>}
        </div>
      </div>

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
