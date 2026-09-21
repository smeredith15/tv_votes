import { InstallPanel } from "./InstallPanel";
import { RUNNING_BUNDLE, type VersionInfo } from "../lib/version";
import { RepoPanel } from "./RepoPanel";
import type { Store } from "../lib/store";

export function SettingsView({ store, published }: { store: Store; published: VersionInfo | null }) {
  const { settings, setSettings } = store;

  return (
    <>
      <InstallPanel />

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong className="small">This app</strong>
          <span className="small muted">
            running <code>{RUNNING_BUNDLE}</code>
            {published && ` · published ${published.commit}, ${new Date(published.builtAt).toLocaleString()}`}
          </span>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Saving a vote commits to the repo and redeploys, so the commit moves often while the app
          itself does not. It is the bundle name that says whether this is the current app.
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
