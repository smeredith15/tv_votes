import { useEffect, useState } from "react";
import { canInstall, install, isInstalled, onInstallChange } from "../lib/install";

/** iOS never offers the prompt; its route is the share sheet. */
function isApple(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Putting the app on the home screen, by whichever route this browser has. */
export function InstallPanel() {
  const [available, setAvailable] = useState(canInstall());
  const [installed] = useState(isInstalled());

  useEffect(() => onInstallChange(() => setAvailable(canInstall())), []);

  if (installed) {
    return (
      <div className="panel">
        <strong className="small">Installed</strong>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Running as an app. It opens without a connection and shows the ledgers as they were last
          loaded; saving a vote still needs one.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong className="small">Put it on the home screen</strong>
        {available && (
          <button className="primary" onClick={() => void install()}>
            Install
          </button>
        )}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {available
          ? "Opens in its own window, with an icon like any other app."
          : isApple()
            ? "In Safari: Share, then Add to Home Screen."
            : "Your browser offers this from its own menu — look for Install or Add to Home screen."}
      </p>
    </div>
  );
}
