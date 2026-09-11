import { BUILT_AT, RUNNING_VERSION } from "../lib/version";
import { RepoPanel } from "./RepoPanel";
import type { Store } from "../lib/store";

export function SettingsView({ store }: { store: Store }) {
  const { settings, setSettings } = store;

  return (
    <>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong className="small">This app</strong>
          <span className="small muted">
            build <code>{RUNNING_VERSION}</code>
            {BUILT_AT && ` · ${new Date(BUILT_AT).toLocaleString()}`}
          </span>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          If that does not match the newest commit on main, the browser is still holding an older copy —
          a hard refresh replaces it.
        </p>
      </div>

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

    </>
  );
}
