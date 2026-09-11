import { useState } from "react";
import { checkToken } from "../lib/github";
import type { Store } from "../lib/store";

/**
 * Where the ledgers live and the token that may write to them. Shown both in
 * Settings and, when nothing is readable yet, as the app's first-run panel.
 */
export function RepoPanel({ store }: { store: Store }) {
  const { settings, setSettings } = store;
  const [tokenState, setTokenState] = useState<string | null>(null);

  async function verify() {
    setTokenState("Checking…");
    try {
      const result = await checkToken(settings.repo);
      setTokenState(result.detail);
      if (result.ok) await store.reload();
    } catch (e) {
      // Nothing below should throw, but the button must never be left hanging.
      setTokenState(e instanceof Error ? e.message : String(e));
    }
  }

  return (
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
  );
}
