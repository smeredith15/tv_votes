import assert from "node:assert/strict";
import { test } from "node:test";
import { eligibleLedgers, runFinished } from "../src/lib/ledgers";
import { applyOps, cloneForOps, compact, type Op } from "../src/lib/ops";
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
  // A season is waiting, so this would otherwise be votable.
  const normal = makeShow({ id: "a", runtime: 60, status: "returning", seasons: seasons(4, 3) });
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

test("keeping a draw records the seasons that vote bought", () => {
  // Eight half-hour seasons, the first three watched: the vote buys season 4,
  // the rest of the near half.
  const data = makeData([makeShow({ id: "ent", runtime: 30, seasons: seasons(8, 3) })]);
  applyOps(data, [{ type: "draw", draw: draw("half", "ent") }]);
  assert.deepEqual(data.watching.progress?.half?.seasons, [4]);
  assert.equal(data.watching.progress?.half?.episode, 30, "picked up where the ticks left off");
});

test("finishing a run leaves it where it is rather than rolling on", () => {
  const data = makeData([makeShow({ id: "ent", runtime: 30, seasons: seasons(8, 3) })]);
  const ops: Op[] = [
    { type: "draw", draw: draw("half", "ent") },
    // Through the rest of season 4.
    { type: "setEpisode", run: "half", showId: "ent", episode: 40 },
  ];
  applyOps(data, ops);

  assert.deepEqual(data.watching.progress?.half?.seasons, [4], "still the run that was won");
  assert.deepEqual(
    data.shows[0].seasons.filter((s) => s.watched).map((s) => s.number),
    [1, 2, 3, 4],
  );
  assert.equal(runFinished(data.shows[0], data.watching.progress!.half!.seasons!), true);
});

test("carrying on by hand takes the next half and keeps the cursor", () => {
  const data = makeData([makeShow({ id: "ent", runtime: 30, seasons: seasons(8, 4) })]);
  applyOps(data, [
    { type: "setPick", ledger: "half", showId: "ent" },
    { type: "continueRun", ledger: "half", showId: "ent", seasons: [5, 6, 7, 8] },
  ]);

  assert.deepEqual(data.watching.progress?.half?.seasons, [5, 6, 7, 8]);
  assert.equal(data.watching.progress?.half?.episode, 40, "forty episodes in, still");
});

test("putting a ballot on another show starts that run from its own ticks", () => {
  const data = makeData([
    makeShow({ id: "ent", runtime: 30, seasons: seasons(8, 4) }),
    makeShow({ id: "crown", runtime: 60, seasons: seasons(6, 2) }),
  ]);
  applyOps(data, [
    { type: "setPick", ledger: "half", showId: "ent" },
    { type: "setPick", ledger: "half", showId: "crown" },
  ]);

  assert.equal(data.watching.progress?.half?.showId, "crown");
  assert.deepEqual(data.watching.progress?.half?.seasons, [3], "an hour-long show goes one at a time");
  assert.equal(data.watching.progress?.half?.episode, 20);
});

test("a cursor move made after carrying on does not undo it", () => {
  // Every dispatch compacts the queue, which can put the cursor move either
  // side of the continue. Naming the seasons is what makes both orders agree.
  const ops: Op[] = [
    { type: "setPick", ledger: "mini", showId: "crown" },
    { type: "continueRun", ledger: "mini", showId: "crown", seasons: [2] },
    // Back one, so season 1 is no longer finished.
    { type: "setEpisode", run: "mini", showId: "crown", episode: 9 },
  ];

  for (const order of [ops, compact(ops), [ops[0], ops[2], ops[1]]]) {
    const data = makeData([makeShow({ id: "crown", runtime: 60, seasons: seasons(6, 1) })]);
    applyOps(data, order);
    assert.deepEqual(data.watching.progress?.mini?.seasons, [2], "still season 2");
    assert.equal(data.watching.progress?.mini?.episode, 9);
  }
});

test("a vote kept on the same show overrides the prompt to keep going", () => {
  const data = makeData([makeShow({ id: "crown", runtime: 60, seasons: seasons(6) })]);
  applyOps(data, [
    { type: "setPick", ledger: "mini", showId: "crown" },
    // Through season 1, which is all that vote bought.
    { type: "setEpisode", run: "mini", showId: "crown", episode: 10 },
  ]);
  assert.deepEqual(data.watching.progress?.mini?.seasons, [1]);
  assert.equal(runFinished(data.shows[0], [1]), true, "season 1 watched: the run is over");

  // Voting again lands on the same show, which is a new run, not the old one.
  applyOps(data, [{ type: "draw", draw: draw("mini", "crown") }]);
  assert.deepEqual(data.watching.progress?.mini?.seasons, [2]);
  assert.equal(runFinished(data.shows[0], [2]), false, "nothing of season 2 watched yet");
});
