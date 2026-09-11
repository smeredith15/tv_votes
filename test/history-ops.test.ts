import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOps } from "../src/lib/ops";
import { makeData, makeShow } from "./helpers";
import type { Draw } from "../src/lib/types";

const draw = (id: string, winnerId = "a"): Draw => ({
  id,
  ledger: "hour",
  drawnAt: "2026-09-11T00:00:00.000Z",
  allocations: {},
  totalWeight: 10,
  roll: 3,
  seed: "abc",
  winnerId,
  winnerTitle: winnerId,
  standings: [],
});

test("one draw can be deleted without touching the rest", () => {
  const data = makeData([makeShow({ id: "a" })]);
  data.history = [draw("one"), draw("two"), draw("three")];
  applyOps(data, [{ type: "forgetDraw", drawId: "two" }]);
  assert.deepEqual(data.history.map((d) => d.id), ["one", "three"]);
});

test("deleting a draw that is already gone changes nothing", () => {
  const data = makeData([]);
  data.history = [draw("one")];
  applyOps(data, [{ type: "forgetDraw", drawId: "nope" }]);
  assert.deepEqual(data.history.map((d) => d.id), ["one"]);
});

test("clearing wipes the history and leaves everything else alone", () => {
  const data = makeData([makeShow({ id: "a", title: "A" })]);
  data.history = [draw("one"), draw("two")];
  applyOps(data, [{ type: "clearHistory" }]);
  assert.deepEqual(data.history, []);
  assert.equal(data.shows.length, 1);
});

test("a draw is only in the history once it is kept", () => {
  // The wheel settles on a result, but nothing is recorded until you say so.
  const data = makeData([makeShow({ id: "a" })]);
  assert.deepEqual(data.history, []);
  applyOps(data, [{ type: "draw", draw: draw("kept") }]);
  assert.deepEqual(data.history.map((d) => d.id), ["kept"]);
});

test("Plex seasons are recorded, sorted, and cleaned up when emptied", () => {
  const data = makeData([makeShow({ id: "witcher" })]);
  applyOps(data, [
    { type: "plexSeason", showId: "witcher", season: 3, present: true },
    { type: "plexSeason", showId: "witcher", season: 1, present: true },
    { type: "plexSeason", showId: "witcher", season: 2, present: true },
  ]);
  assert.deepEqual(data.plex.shows.witcher, [1, 2, 3]);

  applyOps(data, [{ type: "plexSeason", showId: "witcher", season: 2, present: false }]);
  assert.deepEqual(data.plex.shows.witcher, [1, 3]);

  // Unticking the last one drops the show rather than leaving an empty list.
  applyOps(data, [
    { type: "plexSeason", showId: "witcher", season: 1, present: false },
    { type: "plexSeason", showId: "witcher", season: 3, present: false },
  ]);
  assert.deepEqual(data.plex.shows, {});
});

test("marking a season on Plex says nothing about having watched it", () => {
  const data = makeData([
    makeShow({ id: "a", seasons: [{ number: 1, episodes: 8, watched: false }] }),
  ]);
  applyOps(data, [{ type: "plexSeason", showId: "a", season: 1, present: true }]);
  assert.equal(data.shows[0].seasons[0].watched, false);
  assert.deepEqual(data.plex.shows.a, [1]);
});
