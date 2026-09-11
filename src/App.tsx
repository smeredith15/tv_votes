import { useState } from "react";
import { useStore } from "./lib/store";
import { HistoryView } from "./views/HistoryView";
import { InboxView } from "./views/InboxView";
import { LibraryView } from "./views/LibraryView";
import { NowView } from "./views/NowView";
import { RepoPanel } from "./views/RepoPanel";
import { SettingsView } from "./views/SettingsView";
import { ShowsView } from "./views/ShowsView";
import { UniverseView } from "./views/UniverseView";
import { VoteView } from "./views/VoteView";

const TABS = [
  { id: "now", label: "Now watching" },
  { id: "vote", label: "Vote" },
  { id: "shows", label: "Shows" },
  { id: "library", label: "Watched & Plex" },
  { id: "universes", label: "Universes" },
  { id: "history", label: "History" },
  { id: "inbox", label: "Inbox" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function App() {
  const store = useStore(import.meta.env.BASE_URL);
  const [tab, setTab] = useState<TabId>("now");
  const { data, needsToken, pending, sync, syncing, error } = store;

  return (
    <div className="app">
      <header className="bar">
        <h1>TV Votes</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "inbox" && data?.inbox.length ? ` (${data.inbox.length})` : ""}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        {pending > 0 && (
          <button className="primary" onClick={() => void sync()} disabled={syncing}>
            {syncing ? "Saving…" : `Save ${pending} change${pending === 1 ? "" : "s"}`}
          </button>
        )}
      </header>

      {error && <div className="banner" role="alert">{error}</div>}

      {needsToken ? (
        <>
          <div className="panel">
            <strong>One thing first</strong>
            <p className="small muted" style={{ marginBottom: 0 }}>
              This copy of the app carries no ledgers of its own — they live in your private repo. Paste a
              token below and everything loads.
            </p>
          </div>
          <RepoPanel store={store} />
        </>
      ) : !data ? (
        <p className="muted">Loading the ledgers…</p>
      ) : (
        <>
          {tab === "now" && <NowView store={store} data={data} />}
          {tab === "vote" && <VoteView store={store} data={data} />}
          {tab === "shows" && <ShowsView store={store} data={data} />}
          {tab === "library" && <LibraryView store={store} data={data} />}
          {tab === "universes" && <UniverseView store={store} data={data} />}
          {tab === "history" && <HistoryView store={store} data={data} />}
          {tab === "inbox" && <InboxView store={store} data={data} />}
          {tab === "settings" && <SettingsView store={store} data={data} />}
        </>
      )}
    </div>
  );
}
