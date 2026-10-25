import assert from "node:assert/strict";
import { test } from "node:test";
import { airedEpisodes, totalEpisodes } from "../src/lib/episodes";
import { asideRun, ballotFor } from "../src/lib/ledgers";
import { applyOps, cloneForOps, migrate, type Op } from "../src/lib/ops";
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
  applyOps(data, [{ type: "setEpisode", run: "weekly", showId: "wire", episode: 30 }]);

  assert.equal(data.watching.progress?.weekly?.episode, 30);
  assert.deepEqual(
    data.shows[0].seasons.map((s) => s.watched),
    [true, true, false, false, false],
    "part way through the third season",
  );

  applyOps(data, [{ type: "setEpisode", run: "weekly", showId: "wire", episode: 37 }]);
  assert.deepEqual(data.shows[0].seasons.map((s) => s.watched), [true, true, true, false, false]);
});

test("the cursor cannot run off either end", () => {
  const data = withWire();
  applyOps(data, [{ type: "setEpisode", run: "weekly", showId: "wire", episode: -5 }]);
  assert.equal(data.watching.progress?.weekly?.episode, 0);

  applyOps(data, [{ type: "setEpisode", run: "weekly", showId: "wire", episode: 999 }]);
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
    { type: "setEpisode", run: "weekly", showId: "wire", episode: 30 },
    { type: "longWeekend", ledger: "weekly", showId: "wire", delta: 2 },
  ]);

  applyOps(data, [{ type: "setEpisode", run: "weekly", showId: "fargo", episode: 3 }]);
  const progress = data.watching.progress?.weekly;
  assert.equal(progress?.showId, "fargo");
  assert.equal(progress?.episode, 3);
  assert.equal(progress?.longWeekends, 0, "the old show's long weekends do not carry over");
});

test("each ballot tracks its own show", () => {
  const data = withWire();
  data.shows.push(makeShow({ id: "entourage", runtime: 30, seasons: seasons(8) }));
  applyOps(data, [
    { type: "setEpisode", run: "weekly", showId: "wire", episode: 26 },
    { type: "setEpisode", run: "half", showId: "entourage", episode: 12 },
  ]);
  assert.equal(data.watching.progress?.weekly?.episode, 26);
  assert.equal(data.watching.progress?.half?.episode, 12);
});

test("progress does not leak back through the cheap copy", () => {
  const base = withWire();
  const ops: Op[] = [{ type: "setEpisode", run: "weekly", showId: "wire", episode: 30 }];
  const next = applyOps(cloneForOps(base, ops), ops);

  assert.equal(next.watching.progress?.weekly?.episode, 30);
  assert.equal(base.watching.progress?.weekly, undefined, "progress leaked");
  assert.deepEqual(base.shows[0].seasons.map((s) => s.watched), [true, true, false, false, false]);
});

test("a show on the side keeps a cursor of its own", () => {
  const data = makeData([
    makeShow({ id: "abbott", runtime: 30, seasons: seasons(6, 5) }),
    makeShow({ id: "wire", runtime: 60, seasons: seasons(5, 2) }),
  ]);
  applyOps(data, [
    { type: "aside", showId: "abbott", add: true },
    { type: "setEpisode", run: asideRun("abbott"), showId: "abbott", episode: 52 },
    { type: "setEpisode", run: "weekly", showId: "wire", episode: 30 },
  ]);

  assert.equal(data.watching.progress?.["aside:abbott"]?.episode, 52);
  assert.equal(data.watching.progress?.weekly?.episode, 30, "the Friday ballot is untouched");
  // Ticks follow the cursor here too, so the season list agrees with it.
  assert.deepEqual(
    data.shows[0].seasons.map((s) => s.watched),
    [true, true, true, true, true, false],
  );
});

test("only the episodes that have aired count as waiting", () => {
  const show = makeShow({
    id: "abbott",
    seasons: [
      { number: 1, episodes: 10, aired: 10, watched: true },
      // Four ordered, two of them out so far.
      { number: 2, episodes: 4, aired: 2, watched: false },
    ],
  });
  assert.equal(totalEpisodes(show), 14);
  assert.equal(airedEpisodes(show), 12);

  // Seasons stored before airing was tracked are taken as fully out.
  const older = makeShow({ id: "old", seasons: seasons(2) });
  assert.equal(airedEpisodes(older), totalEpisodes(older));
});

test("an unsaved cursor from an older bundle still lands on its ballot", () => {
  const legacy = [{ type: "setEpisode", ledger: "weekly", showId: "wire", episode: 30 }] as unknown as Op[];
  const data = makeData([makeShow({ id: "wire", runtime: 60, seasons: seasons(5, 2) })]);
  applyOps(data, migrate(legacy));

  assert.equal(data.watching.progress?.weekly?.episode, 30);
});
