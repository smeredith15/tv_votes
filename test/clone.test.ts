import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOps, cloneForOps, type Op } from "../src/lib/ops";
import { makeData, makeShow, seasons } from "./helpers";

function dataset() {
  const data = makeData([
    makeShow({ id: "a", title: "A", seasons: seasons(3) }),
    makeShow({ id: "b", title: "B", seasons: seasons(2) }),
  ]);
  data.universes = [
    { id: "mcu", name: "MCU", entryShowId: "mcu", order: [{ label: "Iron Man", watched: false }] },
    { id: "dc", name: "DC", entryShowId: "dc", order: [{ label: "Arrow", watched: false }] },
  ];
  return data;
}

test("applying ops to the copy never touches the original", () => {
  const base = dataset();
  const ops: Op[] = [
    { type: "season", showId: "a", season: 2, watched: true },
    { type: "vote", showId: "a", ledger: "hour", person: "scotty", points: 40 },
    { type: "universeItem", universeId: "mcu", index: 0, watched: true },
    { type: "plexSeason", showId: "b", season: 1, present: true },
  ];

  applyOps(cloneForOps(base, ops), ops);

  assert.equal(base.shows[0].seasons[1].watched, false, "season leaked");
  assert.equal(base.shows[0].votes.hour.scotty, 0, "vote leaked");
  assert.equal(base.universes[0].order[0].watched, false, "universe leaked");
  assert.deepEqual(base.plex.shows, {}, "plex leaked");
});

test("history and inbox changes do not leak either", () => {
  const base = dataset();
  base.history = [
    {
      id: "d1", ledger: "hour", drawnAt: "2026-01-01T00:00:00.000Z", allocations: {},
      totalWeight: 1, roll: 1, seed: "s", winnerId: "a", winnerTitle: "A", standings: [],
    },
  ];
  base.inbox = [{ tmdbId: 5, title: "New", runtime: 60, suggestedAt: "x" }];

  const ops: Op[] = [{ type: "clearHistory" }, { type: "inbox", tmdbId: 5, accept: false }];
  applyOps(cloneForOps(base, ops), ops);

  assert.equal(base.history.length, 1);
  assert.equal(base.inbox.length, 1);
});

test("shows an op does not touch keep their identity, so the list can skip them", () => {
  // This is what stops a thousand rows re-rendering when one season is ticked.
  const base = dataset();
  const copy = cloneForOps(base, [{ type: "season", showId: "a", season: 1, watched: true }]);

  assert.notEqual(copy.shows[0], base.shows[0], "the edited show must be copied");
  assert.equal(copy.shows[1], base.shows[1], "an untouched show should be the same object");
  assert.equal(copy.universes[1], base.universes[1], "an untouched universe likewise");
});

test("the copy produces the same result as copying everything", () => {
  const ops: Op[] = [
    { type: "season", showId: "a", season: 1, watched: true },
    { type: "vote", showId: "b", ledger: "half", person: "shelby", points: 10 },
    { type: "freePoints", showId: "a" },
  ];
  const cheap = applyOps(cloneForOps(dataset(), ops), ops);
  const thorough = applyOps(structuredClone(dataset()), ops);
  assert.deepEqual(cheap.shows, thorough.shows);
});

test("adding a show through the inbox still works on the copy", () => {
  const base = dataset();
  const ops: Op[] = [
    { type: "inbox", tmdbId: 9, accept: true, show: makeShow({ id: "collision", title: "Collision" }) },
  ];
  const next = applyOps(cloneForOps(base, ops), ops);
  assert.deepEqual(next.shows.map((s) => s.id), ["a", "b", "collision"]);
  assert.equal(base.shows.length, 2);
});
