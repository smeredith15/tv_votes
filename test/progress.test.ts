import assert from "node:assert/strict";
import { test } from "node:test";
import { ballotFor } from "../src/lib/ledgers";
import { applyOps, cloneForOps, type Op } from "../src/lib/ops";
import { makeData, makeShow, seasons } from "./helpers";

const wireSeasons = [
  { number: 1, episodes: 13, watched: true },
  { number: 2, episodes: 12, watched: true },
  { number: 3, episodes: 12, watched: false },
  { number: 4, episodes: 13, watched: false },
  { number: 5, episodes: 10, watched: false },
];

function withWire() {
  const data = makeData([makeShow({ id: "wire", title: "The Wire", runtime: 60, seasons: wireSeasons })]);
  data.watching.picks = { weekly: "wire" };
  return data;
}

test("the Friday show runs to the end whatever its length", () => {
  // An hour-long show used to be offered a season at a time here, like the
  // hour ballot. On Fridays only the episodes-per-week differ.
  const hour = makeShow({ id: "wire", runtime: 60, seasons: wireSeasons });
  assert.deepEqual(ballotFor(hour, "weekly").seasons, [3, 4, 5]);

  const half = makeShow({ id: "office", runtime: 30, seasons: seasons(9) });
  assert.deepEqual(ballotFor(half, "weekly").label, "Whole series");
  // The hour ballot still goes one season at a time.
  assert.deepEqual(ballotFor(hour, "hour").seasons, [3]);
});

test("moving the cursor keeps the season ticks in step", () => {
  const data = withWire();
  applyOps(data, [{ type: "setEpisode", ledger: "weekly", showId: "wire", episode: 30 }]);

  assert.equal(data.watching.progress?.weekly?.episode, 30);
  assert.deepEqual(
    data.shows[0].seasons.map((s) => s.watched),
    [true, true, false, false, false],
    "part way through the third season",
  );

  applyOps(data, [{ type: "setEpisode", ledger: "weekly", showId: "wire", episode: 37 }]);
  assert.deepEqual(data.shows[0].seasons.map((s) => s.watched), [true, true, true, false, false]);
});

test("the cursor cannot run off either end", () => {
  const data = withWire();
  applyOps(data, [{ type: "setEpisode", ledger: "weekly", showId: "wire", episode: -5 }]);
  assert.equal(data.watching.progress?.weekly?.episode, 0);

  applyOps(data, [{ type: "setEpisode", ledger: "weekly", showId: "wire", episode: 999 }]);
  assert.equal(data.watching.progress?.weekly?.episode, 60);
});

test("recording a start does not throw away what was already watched", () => {
  // Two seasons were ticked long before any of this existed; saving the start
  // date must not read as "nothing watched".
  const data = withWire();
  applyOps(data, [
    { type: "startRun", ledger: "weekly", showId: "wire", startedOn: "2026-09-11", startEpisode: 25 },
  ]);
  assert.equal(data.watching.progress?.weekly?.episode, 25);
  assert.deepEqual(data.shows[0].seasons.map((s) => s.watched), [true, true, false, false, false]);
});

test("banking a long weekend does not move the cursor either", () => {
  const data = withWire();
  applyOps(data, [{ type: "longWeekend", ledger: "weekly", showId: "wire", delta: 1 }]);
  assert.equal(data.watching.progress?.weekly?.episode, 25);
});

test("a run records when and where it began", () => {
  const data = withWire();
  applyOps(data, [
    { type: "startRun", ledger: "weekly", showId: "wire", startedOn: "2026-09-11", startEpisode: 25 },
  ]);
  const progress = data.watching.progress?.weekly;
  assert.equal(progress?.startedOn, "2026-09-11");
  assert.equal(progress?.startEpisode, 25, "picked up from the top of season three");
});

test("long weekends are banked and can be taken back, never below zero", () => {
  const data = withWire();
  applyOps(data, [
    { type: "longWeekend", ledger: "weekly", showId: "wire", delta: 1 },
    { type: "longWeekend", ledger: "weekly", showId: "wire", delta: 1 },
  ]);
  assert.equal(data.watching.progress?.weekly?.longWeekends, 2);

  applyOps(data, [
    { type: "longWeekend", ledger: "weekly", showId: "wire", delta: -1 },
    { type: "longWeekend", ledger: "weekly", showId: "wire", delta: -1 },
    { type: "longWeekend", ledger: "weekly", showId: "wire", delta: -1 },
  ]);
  assert.equal(data.watching.progress?.weekly?.longWeekends, 0);
});

test("progress belongs to a ballot's show, and starts over when the pick does", () => {
  const data = withWire();
  data.shows.push(makeShow({ id: "fargo", runtime: 60, seasons: seasons(5) }));
  applyOps(data, [
    { type: "setEpisode", ledger: "weekly", showId: "wire", episode: 30 },
    { type: "longWeekend", ledger: "weekly", showId: "wire", delta: 2 },
  ]);

  applyOps(data, [{ type: "setEpisode", ledger: "weekly", showId: "fargo", episode: 3 }]);
  const progress = data.watching.progress?.weekly;
  assert.equal(progress?.showId, "fargo");
  assert.equal(progress?.episode, 3);
  assert.equal(progress?.longWeekends, 0, "the old show's long weekends do not carry over");
});

test("each ballot tracks its own show", () => {
  const data = withWire();
  data.shows.push(makeShow({ id: "entourage", runtime: 30, seasons: seasons(8) }));
  applyOps(data, [
    { type: "setEpisode", ledger: "weekly", showId: "wire", episode: 26 },
    { type: "setEpisode", ledger: "half", showId: "entourage", episode: 12 },
  ]);
  assert.equal(data.watching.progress?.weekly?.episode, 26);
  assert.equal(data.watching.progress?.half?.episode, 12);
});

test("progress does not leak back through the cheap copy", () => {
  const base = withWire();
  const ops: Op[] = [{ type: "setEpisode", ledger: "weekly", showId: "wire", episode: 30 }];
  const next = applyOps(cloneForOps(base, ops), ops);

  assert.equal(next.watching.progress?.weekly?.episode, 30);
  assert.equal(base.watching.progress?.weekly, undefined, "progress leaked");
  assert.deepEqual(base.shows[0].seasons.map((s) => s.watched), [true, true, false, false, false]);
});
