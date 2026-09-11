import { ballotFor, isEligible, ledgerBalanced } from "./ledgers";
import type { Dataset, Draw, LedgerId, Show } from "./types";

export interface Ticket {
  show: Show;
  weight: number;
  /** Running total, so the winning roll can be located the way the workbook did. */
  cumulative: number;
}

/**
 * Deterministic PRNG so a recorded draw can be replayed from its seed. The
 * seed itself comes from crypto, so the result is unpredictable but provable.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function newSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Every show with at least one point on this ballot, with its cumulative range. */
export function tickets(data: Dataset, ledger: LedgerId): Ticket[] {
  let cumulative = 0;
  const out: Ticket[] = [];
  for (const show of data.shows) {
    if (!isEligible(show, ledger)) continue;
    const weight = data.people.reduce((sum, p) => sum + (show.votes[ledger]?.[p] ?? 0), 0);
    if (weight <= 0) continue;
    cumulative += weight;
    out.push({ show, weight, cumulative });
  }
  return out;
}

export function totalWeight(data: Dataset, ledger: LedgerId): number {
  const all = tickets(data, ledger);
  return all.length ? all[all.length - 1].cumulative : 0;
}

export class DrawError extends Error {}

/**
 * Draw a winner, weighted by the points both of you spent — the same
 * RANDBETWEEN-and-MATCH the workbook does, but recorded so it cannot be
 * quietly re-rolled.
 */
export function drawWinner(data: Dataset, ledger: LedgerId, seed = newSeed()): Draw {
  if (!ledgerBalanced(data, ledger)) {
    throw new DrawError("Cheater — you two have not spent the same number of points.");
  }
  const pool = tickets(data, ledger);
  const total = pool.length ? pool[pool.length - 1].cumulative : 0;
  if (total <= 0) throw new DrawError("No points have been spent on this ballot yet.");

  const roll = 1 + Math.floor(mulberry32(seedToInt(seed))() * total);
  const winner = pool.find((t) => roll <= t.cumulative) ?? pool[pool.length - 1];

  const allocations = Object.fromEntries(
    data.people.map((person) => [
      person,
      Object.fromEntries(
        pool
          .map((t) => [t.show.id, t.show.votes[ledger]?.[person] ?? 0] as const)
          .filter(([, points]) => points > 0),
      ),
    ]),
  );

  return {
    id: `${ledger}-${Date.now()}`,
    ledger,
    drawnAt: new Date().toISOString(),
    allocations,
    totalWeight: total,
    roll,
    seed,
    winnerId: winner.show.id,
    winnerTitle: winner.show.title,
    ballot: ballotFor(winner.show, ledger).label,
    standings: pool
      .map((t) => ({ id: t.show.id, title: t.show.title, weight: t.weight }))
      .sort((a, b) => b.weight - a.weight),
  };
}

/**
 * A handful of titles for the spin, each a genuine weighted draw. They are
 * near-misses rather than decoration: a show only flashes past if it really
 * could have won.
 */
export function spinTitles(data: Dataset, ledger: LedgerId, count: number): string[] {
  const pool = tickets(data, ledger);
  if (pool.length === 0) return [];
  return Array.from({ length: count }, () => {
    const total = pool[pool.length - 1].cumulative;
    const roll = 1 + Math.floor(mulberry32(seedToInt(newSeed()))() * total);
    return (pool.find((t) => roll <= t.cumulative) ?? pool[pool.length - 1]).show.title;
  });
}

/** Re-run a recorded draw from its seed to confirm the winner was not fudged. */
export function verifyDraw(draw: Draw): boolean {
  const roll = 1 + Math.floor(mulberry32(seedToInt(draw.seed))() * draw.totalWeight);
  return roll === draw.roll;
}
