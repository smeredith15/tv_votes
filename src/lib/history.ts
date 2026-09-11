import type { Dataset, Draw, LedgerId } from "./types";

export interface ShowRecord {
  id: string;
  title: string;
  /** Ballots this show has ever had points on. */
  appearances: number;
  wins: number;
  /** Best finish across all draws, 1 being the win. */
  bestPlace: number | null;
  /** Every point either of you has ever spent on it. */
  lifetimePoints: number;
  lastSeen: string | null;
}

/**
 * Roll up the draw log per show. The point of this is the shows with
 * appearances but no wins — the ones you keep backing that never come up.
 */
export function showRecords(history: Draw[], ledger?: LedgerId): Map<string, ShowRecord> {
  const records = new Map<string, ShowRecord>();
  for (const draw of history) {
    if (ledger && draw.ledger !== ledger) continue;
    draw.standings.forEach((entry, index) => {
      const record = records.get(entry.id) ?? {
        id: entry.id,
        title: entry.title,
        appearances: 0,
        wins: 0,
        bestPlace: null,
        lifetimePoints: 0,
        lastSeen: null,
      };
      const place = entry.id === draw.winnerId ? 1 : index + 1;
      record.appearances += 1;
      record.wins += entry.id === draw.winnerId ? 1 : 0;
      record.bestPlace = record.bestPlace === null ? place : Math.min(record.bestPlace, place);
      record.lifetimePoints += entry.weight;
      record.lastSeen = !record.lastSeen || draw.drawnAt > record.lastSeen ? draw.drawnAt : record.lastSeen;
      records.set(entry.id, record);
    });
  }
  return records;
}

/** Shows you have voted for over and over that have never won a draw. */
export function neverPicked(data: Dataset, ledger?: LedgerId): ShowRecord[] {
  return [...showRecords(data.history, ledger).values()]
    .filter((r) => r.wins === 0)
    .sort((a, b) => b.appearances - a.appearances || b.lifetimePoints - a.lifetimePoints);
}

export function drawsFor(data: Dataset, showId: string): Draw[] {
  return data.history.filter((d) => d.standings.some((s) => s.id === showId));
}
