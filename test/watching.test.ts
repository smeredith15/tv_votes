import assert from "node:assert/strict";
import { test } from "node:test";
import { eligibleLedgers } from "../src/lib/ledgers";
import { applyOps, cloneForOps, type Op } from "../src/lib/ops";
import { makeData, makeShow, seasons } from "./helpers";
import type { Draw } from "../src/lib/types";

const draw = (ledger: Draw["ledger"], winnerId: string): Draw => ({
  id: `${ledger}-1`,
  ledger,
  drawnAt: "2026-09-11T00:00:00.000Z",
  allocations: {},
  totalWeight: 10,
  roll: 1,
  seed: "s",
  winnerId,
  winnerTitle: winnerId,
  standings: [],
});

test("keeping a draw puts that ballot on the show it landed on", () => {
  const data = makeData([makeShow({ id: "witcher" })]);
  applyOps(data, [{ type: "draw", draw: draw("hour", "witcher") }]);
  assert.equal(data.watching.picks.hour, "witcher");
});

test("a ballot can be put on a show by hand, over a draw", () => {
  const data = makeData([makeShow({ id: "witcher" }), makeShow({ id: "fargo" })]);
  applyOps(data, [
    { type: "draw", draw: draw("hour", "witcher") },
    { type: "setPick", ledger: "hour", showId: "fargo" },
  ]);
  assert.equal(data.watching.picks.hour, "fargo");
  // The draw is still on the record; only what you are watching changed.
  assert.equal(data.history.length, 1);
});

test("a ballot can be cleared without clearing its history", () => {
  const data = makeData([makeShow({ id: "witcher" })]);
  applyOps(data, [
    { type: "draw", draw: draw("hour", "witcher") },
    { type: "setPick", ledger: "hour", showId: null },
  ]);
  assert.equal(data.watching.picks.hour, null);
  assert.equal(data.history.length, 1);
});

test("each ballot keeps its own pick", () => {
  const data = makeData([makeShow({ id: "a" }), makeShow({ id: "b" })]);
  applyOps(data, [
    { type: "setPick", ledger: "hour", showId: "a" },
    { type: "setPick", ledger: "half", showId: "b" },
  ]);
  assert.deepEqual(data.watching.picks, { hour: "a", half: "b" });
});

test("the side list adds, drops, and never doubles up", () => {
  const data = makeData([makeShow({ id: "a" }), makeShow({ id: "b" })]);
  applyOps(data, [
    { type: "aside", showId: "a", add: true },
    { type: "aside", showId: "b", add: true },
    { type: "aside", showId: "a", add: true },
  ]);
  assert.deepEqual(data.watching.asides, ["b", "a"]);

  applyOps(data, [{ type: "aside", showId: "b", add: false }]);
  assert.deepEqual(data.watching.asides, ["a"]);
});

test("a show set to resume on its own is not put to a vote", () => {
  const normal = makeShow({ id: "a", runtime: 60, status: "returning", seasons: seasons(3, 3) });
  assert.deepEqual(eligibleLedgers(normal), ["weekly", "hour"]);

  const auto = makeShow({ ...normal, autoResume: true });
  assert.deepEqual(eligibleLedgers(auto), []);
});

test("picks and the side list survive the cheap copy without leaking back", () => {
  const base = makeData([makeShow({ id: "a" })]);
  const ops: Op[] = [
    { type: "setPick", ledger: "hour", showId: "a" },
    { type: "aside", showId: "a", add: true },
  ];
  const next = applyOps(cloneForOps(base, ops), ops);

  assert.equal(next.watching.picks.hour, "a");
  assert.deepEqual(next.watching.asides, ["a"]);
  assert.deepEqual(base.watching.picks, {}, "pick leaked into the original");
  assert.deepEqual(base.watching.asides, [], "side list leaked into the original");
});
