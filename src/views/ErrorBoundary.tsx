import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catch a render crash and say so.
 *
 * Without this, one bad value takes the whole page to blank white with the
 * reason only in a console nobody has open — which is precisely how a stored
 * empty list went unnoticed. Whatever breaks next, it should at least be
 * readable, and recoverable without developer tools.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("TV Votes crashed while rendering", error, info.componentStack);
  }

  /** Drop this browser's saved state, which is the usual culprit. */
  private reset = (): void => {
    try {
      localStorage.removeItem("tv-votes.pending");
    } catch {
      // Nothing to clear, or storage is blocked; reloading is still worth a go.
    }
    location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app">
        <div className="panel" style={{ marginTop: 24 }}>
          <strong>Something broke while drawing the page.</strong>
          <p className="small">
            Nothing saved to the repo is affected — the ledgers are commits, and this is only the app
            failing to draw them.
          </p>
          <pre className="small muted" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
            {error.message}
          </pre>
          <div className="row">
            <button className="primary" onClick={this.reset}>
              Discard unsaved changes and reload
            </button>
            <button onClick={() => location.reload()}>Just reload</button>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Discarding drops only changes not yet saved to GitHub.
          </p>
        </div>
      </div>
    );
  }
}
