import { useState } from "react";
import { useStore } from "./lib/store";
import { HistoryView } from "./views/HistoryView";
import { InboxView } from "./views/InboxView";
import { SettingsView } from "./views/SettingsView";
import { ShowsView } from "./views/ShowsView";
import { UniverseView } from "./views/UniverseView";
import { VoteView } from "./views/VoteView";

const TABS = [
  { id: "vote", label: "Vote" },
  { id: "shows", label: "Shows" },
  { id: "universes", label: "Universes" },
  { id: "history", label: "History" },
  { id: "inbox", label: "Inbox" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function App() {
  const store = useStore(import.meta.env.BASE_URL);
  const [tab, setTab] = useState<TabId>("vote");
  const { data, pending, sync, syncing, error } = store;

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

      {!data ? (
        <p className="muted">Loading the ledgers…</p>
      ) : (
        <>
          {tab === "vote" && <VoteView store={store} data={data} />}
          {tab === "shows" && <ShowsView store={store} data={data} />}
          {tab === "universes" && <UniverseView store={store} data={data} />}
          {tab === "history" && <HistoryView data={data} />}
          {tab === "inbox" && <InboxView store={store} data={data} />}
          {tab === "settings" && <SettingsView store={store} data={data} />}
        </>
      )}
    </div>
  );
}
