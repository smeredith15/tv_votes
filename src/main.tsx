import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./views/ErrorBoundary";
import "./styles.css";

/**
 * Register the offline worker, so the app can be installed and opened without
 * a connection. Only in a build: in dev it would sit between Vite and the page
 * for no benefit.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // An unsupported or blocked worker just means no offline; carry on.
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
