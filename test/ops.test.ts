import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOps, compact, type Op } from "../src/lib/ops";
import { makeData, makeShow, seasons } from "./helpers";

test("votes and season ticks replay onto a dataset", () => {
  const data = makeData([makeShow({ id: "a", seasons: seasons(3) })]);
  applyOps(data, [
    { type: "vote", showId: "a", ledger: "hour", person: "scotty", points: 25 },
    { type: "season", showId: "a", season: 2, watched: true },
  ]);
  assert.equal(data.shows[0].votes.hour.scotty, 25);
  assert.deepEqual(data.shows[0].seasons.map((s) => s.watched), [false, true, false]);
});

test("a vote cannot go negative", () => {
  const data = makeData([makeShow({ id: "a" })]);
  applyOps(data, [{ type: "vote", showId: "a", ledger: "hour", person: "scotty", points: -5 }]);
  assert.equal(data.shows[0].votes.hour.scotty, 0);
});

test("an edit to a show that is gone is ignored rather than fatal", () => {
  const data = makeData([makeShow({ id: "a" })]);
  applyOps(data, [{ type: "vote", showId: "ghost", ledger: "hour", person: "scotty", points: 5 }]);
  assert.equal(data.shows.length, 1);
});

test("replaying a draw twice records it once", () => {
  const data = makeData([]);
  const draw = {
    id: "hour-1",
    ledger: "hour" as const,
    drawnAt: "2026-01-01T00:00:00.000Z",
    allocations: {},
    totalWeight: 10,
    roll: 3,
    seed: "abc",
    winnerId: "a",
    winnerTitle: "A",
    standings: [],
  };
  applyOps(data, [{ type: "draw", draw }, { type: "draw", draw }]);
  assert.equal(data.history.length, 1);
});

test("accepting from the inbox adds the show and clears the suggestion", () => {
  const data = makeData([]);
  data.inbox.push({ tmdbId: 99, title: "New Thing", runtime: 60, suggestedAt: "2026-01-01T00:00:00.000Z" });
  applyOps(data, [{ type: "inbox", tmdbId: 99, accept: true, show: makeShow({ id: "new-thing", tmdbId: 99 }) }]);
  assert.equal(data.inbox.length, 0);
  assert.equal(data.shows.length, 1);
});

test("dismissing from the inbox clears it without adding anything", () => {
  const data = makeData([]);
  data.inbox.push({ tmdbId: 99, title: "No Thanks", runtime: 60, suggestedAt: "2026-01-01T00:00:00.000Z" });
  applyOps(data, [{ type: "inbox", tmdbId: 99, accept: false }]);
  assert.equal(data.inbox.length, 0);
  assert.equal(data.shows.length, 0);
});

test("a suggestion for a show already on the list is dropped", () => {
  const data = makeData([makeShow({ id: "known", tmdbId: 7 })]);
  applyOps(data, [
    { type: "inboxSuggest", item: { tmdbId: 7, title: "Known", runtime: 60, suggestedAt: "x" } },
    { type: "inboxSuggest", item: { tmdbId: 8, title: "Fresh", runtime: 60, suggestedAt: "x" } },
    { type: "inboxSuggest", item: { tmdbId: 8, title: "Fresh", runtime: 60, suggestedAt: "x" } },
  ]);
  assert.deepEqual(data.inbox.map((i) => i.tmdbId), [8]);
});

test("repeated edits to one field collapse to the last one", () => {
  const ops: Op[] = [
    { type: "vote", showId: "a", ledger: "hour", person: "scotty", points: 5 },
    { type: "vote", showId: "a", ledger: "hour", person: "scotty", points: 25 },
    { type: "vote", showId: "a", ledger: "hour", person: "shelby", points: 10 },
    { type: "season", showId: "a", season: 1, watched: true },
    { type: "season", showId: "a", season: 1, watched: false },
  ];
  const squashed = compact(ops);
  assert.equal(squashed.length, 3);
  assert.deepEqual(squashed.find((o) => o.type === "vote" && o.person === "scotty"), {
    type: "vote",
    showId: "a",
    ledger: "hour",
    person: "scotty",
    points: 25,
  });
});

test("draws are never collapsed away", () => {
  const draw = (id: string) => ({
    type: "draw" as const,
    draw: {
      id,
      ledger: "hour" as const,
      drawnAt: "2026-01-01T00:00:00.000Z",
      allocations: {},
      totalWeight: 1,
      roll: 1,
      seed: "s",
      winnerId: "a",
      winnerTitle: "A",
      standings: [],
    },
  });
  assert.equal(compact([draw("one"), draw("two")]).length, 2);
});

test("one person's queued votes replay onto the other's saved changes", () => {
  // Shelby votes from the couch while Scotty's kitchen tab still holds his own
  // unsaved change; replaying his queue must not undo hers.
  const saved = makeData([makeShow({ id: "a" }), makeShow({ id: "b" })]);
  applyOps(saved, [{ type: "vote", showId: "b", ledger: "half", person: "shelby", points: 40 }]);

  applyOps(saved, compact([{ type: "vote", showId: "a", ledger: "half", person: "scotty", points: 15 }]));

  assert.equal(saved.shows[0].votes.half.scotty, 15);
  assert.equal(saved.shows[1].votes.half.shelby, 40);
});
