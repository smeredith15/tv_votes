import { IMAGE_BASE } from "../../scripts/tmdb.mjs";
import type { Show } from "../lib/types";

/**
 * Returning / ended / unknown, with the premiere date when one is known.
 * An unmatched show says nothing rather than stamping "unknown" on every row.
 */
export function StatusPill({ show, verbose = false }: { show: Show; verbose?: boolean }) {
  if (show.status === "returning") {
    const when = show.nextAirDate
      ? new Date(show.nextAirDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : null;
    return <span className="pill returning">{when ? `Returns ${when}` : "Returning"}</span>;
  }
  if (show.status === "ended") return <span className="pill ended">Ended</span>;
  return verbose ? <span className="pill">Status unknown</span> : null;
}

/** Where it streams. Subscription services first; rent/buy only if that is all there is. */
export function ProviderTags({ show, limit = 4, verbose = false }: { show: Show; limit?: number; verbose?: boolean }) {
  const included = show.providers.filter((p) => p.type === "flatrate" || p.type === "free" || p.type === "ads");
  const shown = (included.length ? included : show.providers).slice(0, limit);
  if (shown.length === 0) {
    if (!show.tmdbId && !verbose) return null;
    return <span className="pill muted">{show.tmdbId ? "Not streaming" : "No streaming data"}</span>;
  }
  return (
    <>
      {shown.map((p) => (
        <span key={p.name} className={`pill${p.type === "flatrate" ? " flat" : ""}`} title={p.type}>
          {p.name}
          {p.type === "rent" || p.type === "buy" ? ` (${p.type})` : ""}
        </span>
      ))}
    </>
  );
}

export function Poster({ show, size = 46 }: { show: Show; size?: number }) {
  if (!show.poster) return null;
  return (
    <img
      src={IMAGE_BASE + show.poster}
      alt=""
      width={size}
      height={Math.round(size * 1.5)}
      loading="lazy"
      style={{ borderRadius: 6, objectFit: "cover", flex: "0 0 auto" }}
    />
  );
}
