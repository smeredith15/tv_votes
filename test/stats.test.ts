import assert from "node:assert/strict";
import { test } from "node:test";
import { drawsByLedger, longestDrought, personStats, watchTotals } from "../src/lib/stats";
import type { Draw } from "../src/lib/types";
import { makeData, makeShow, seasons } from "./helpers";

/** A draw where the winner's tickets were split as given. */
function draw(id: string, winnerId: string, allocations: Record<string, Record<string, number>>, ledger: Draw["ledger"] = "hour"): Draw {
  const totals = new Map<string, number>();
  for (const byShow of Object.values(allocations)) {
    for (const [showId, points] of Object.entries(byShow)) {
      totals.set(showId, (totals.get(showId) ?? 0) + points);
    }
  }
  return {
    id,
    ledger,
    drawnAt: "2026-09-11T00:00:00.000Z",
    allocations,
    totalWeight: [...totals.values()].reduce((a, b) => a + b, 0),
    roll: 1,
    seed: "s",
    winnerId,
    winnerTitle: winnerId,
    standings: [...totals].map(([id, weight]) => ({ id, title: id, weight })),
  };
}

const people = ["scotty", "shelby"];

test("a winner one person paid for entirely counts as their win", () => {
  const history = [draw("d1", "a", { scotty: { a: 100 }, shelby: { b: 100 } })];
  const [scotty, shelby] = personStats(history, people);
  assert.equal(scotty.winShare, 1);
  assert.equal(shelby.winShare, 0);
  assert.equal(scotty.backedWinner, 1);
  assert.equal(shelby.shutOut, 1);
});

test("a winner you both backed splits the credit by what each put in", () => {
  const history = [draw("d1", "a", { scotty: { a: 30 }, shelby: { a: 10 } })];
  const [scotty, shelby] = personStats(history, people);
  assert.equal(scotty.winShare, 0.75);
  assert.equal(shelby.winShare, 0.25);
  assert.equal(scotty.backedWinner, 1);
  assert.equal(shelby.backedWinner, 1);
});

test("win share is compared against what each of you actually spent", () => {
  // Equal spend, so a fair run would be half the wins each.
  const history = [
    draw("d1", "a", { scotty: { a: 50 }, shelby: { b: 50 } }),
    draw("d2", "a", { scotty: { a: 50 }, shelby: { b: 50 } }),
  ];
  const [scotty, shelby] = personStats(history, people);
  assert.equal(scotty.spendShare, 1);
  assert.equal(shelby.spendShare, 1);
  assert.equal(scotty.winShare, 2); // running hot
  assert.equal(shelby.winShare, 0);
});

test("stats can be narrowed to one ballot", () => {
  const history = [
    draw("d1", "a", { scotty: { a: 10 }, shelby: {} }, "hour"),
    draw("d2", "b", { scotty: {}, shelby: { b: 10 } }, "half"),
  ];
  assert.equal(personStats(history, people, "hour")[0].winShare, 1);
  assert.equal(personStats(history, people, "half")[0].winShare, 0);
  assert.deepEqual(drawsByLedger(history), { hour: 1, half: 1 });
});

test("no draws yet means no numbers rather than a divide by zero", () => {
  const [scotty] = personStats([], people);
  assert.equal(scotty.winShare, 0);
  assert.equal(scotty.spendShare, 0);
  assert.equal(scotty.shutOut, 0);
  assert.equal(longestDrought([]), null);
});

test("the drought is the show that has been up most often and never won", () => {
  const history = [
    draw("d1", "winner", { scotty: { winner: 10, waiting: 5, other: 1 }, shelby: {} }),
    draw("d2", "winner", { scotty: { winner: 10, waiting: 5 }, shelby: {} }),
    draw("d3", "winner", { scotty: { winner: 10, waiting: 5 }, shelby: {} }),
  ];
  assert.deepEqual(longestDrought(history), { title: "waiting", draws: 3 });
});

test("a show that has won is never counted as waiting", () => {
  const history = [draw("d1", "a", { scotty: { a: 10, b: 10 }, shelby: {} })];
  assert.equal(longestDrought(history)?.title, "b");
});

test("watch totals add up the seasons and episodes actually ticked", () => {
  const data = makeData([
    makeShow({ id: "done", seasons: seasons(3, 3) }),
    makeShow({ id: "part", seasons: seasons(4, 1) }),
    makeShow({ id: "none", seasons: seasons(2, 0) }),
  ]);
  data.universes = [
    { id: "mcu", name: "MCU", entryShowId: "mcu", order: [{ label: "a", watched: true }, { label: "b", watched: false }] },
  ];

  const totals = watchTotals(data);
  assert.equal(totals.showsFinished, 1);
  assert.equal(totals.showsInProgress, 1);
  assert.equal(totals.seasonsWatched, 4);
  assert.equal(totals.episodesWatched, 40); // the helper gives every season 10
  assert.equal(totals.universeItemsWatched, 1);
});
