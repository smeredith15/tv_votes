import { useEffect, useState } from "react";

interface Props {
  /** Titles to flash past — each a real weighted draw, not decoration. */
  teasers: string[];
  winner: string;
  onSettled: () => void;
}

const FLASH_MS = 260;
const SETTLE_MS = 700;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The spin before the result.
 *
 * Every title that flashes past is drawn from the same weighted pool as the
 * winner, so the near-misses are shows that genuinely could have come up —
 * the tease is honest, and the outcome was settled before the first frame.
 */
export function DrawWheel({ teasers, winner, onSettled }: Props) {
  const [shown, setShown] = useState(0);
  const frames = [...teasers, winner];

  useEffect(() => {
    if (prefersReducedMotion()) {
      onSettled();
      return;
    }
    const timers = frames.map((_, index) =>
      setTimeout(() => setShown(index), index * FLASH_MS),
    );
    timers.push(setTimeout(onSettled, teasers.length * FLASH_MS + SETTLE_MS));
    return () => timers.forEach(clearTimeout);
    // The frames are fixed for the life of one spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settling = shown >= teasers.length;

  return (
    <div className="winner" aria-live="polite" aria-busy={!settling}>
      <div className="small muted">{settling ? "And it is…" : "Drawing…"}</div>
      <div
        key={shown}
        className="title spin"
        style={{ opacity: settling ? 1 : 0.75 }}
      >
        {frames[shown]}
      </div>
      <div className="small muted">{settling ? " " : "…"}</div>
    </div>
  );
}
