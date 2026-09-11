import assert from "node:assert/strict";
import { test } from "node:test";
import { ballotFor, eligibleLedgers, episodesPerWeek, ledgerBalanced, watchState } from "../src/lib/ledgers";
import { makeData, makeShow, seasons } from "./helpers";

test("an hour-long series lands on the weekly and hour ballots", () => {
  const show = makeShow({ id: "the-wire", runtime: 60 });
  assert.deepEqual(eligibleLedgers(show), ["weekly", "hour"]);
});

test("a half-hour series lands on the weekly and half ballots", () => {
  const show = makeShow({ id: "30-rock", runtime: 30 });
  assert.deepEqual(eligibleLedgers(show), ["weekly", "half"]);
});

test("a miniseries also lands on the mini ballot", () => {
  const show = makeShow({ id: "chernobyl", runtime: 60, format: "mini" });
  assert.deepEqual(eligibleLedgers(show), ["weekly", "hour", "mini"]);
});

test("a show with no runtime recorded still shows up weekly", () => {
  const show = makeShow({ id: "mystery", runtime: null });
  assert.deepEqual(eligibleLedgers(show), ["weekly"]);
});

test("a show watched inside a universe is off the ballots entirely", () => {
  const show = makeShow({ id: "daredevil", universe: "mcu" });
  assert.deepEqual(eligibleLedgers(show), []);
});

test("the universe itself carries the votes", () => {
  const show = makeShow({ id: "mcu", universe: "mcu", universeEntry: true, runtime: null });
  assert.deepEqual(eligibleLedgers(show), ["weekly", "hour"]);
});

test("a finished show drops off unless it is coming back", () => {
  const done = makeShow({ id: "done", seasons: seasons(3, 3) });
  assert.deepEqual(eligibleLedgers(done), []);

  const returning = makeShow({ id: "more", seasons: seasons(3, 3), status: "returning" });
  assert.deepEqual(eligibleLedgers(returning), ["weekly", "hour"]);
});

test("an explicit exclusion is honoured", () => {
  const show = makeShow({ id: "nope", runtime: 30, exclude: ["half"] });
  assert.deepEqual(eligibleLedgers(show), ["weekly"]);
});

test("watch state follows the season ticks", () => {
  assert.equal(watchState(makeShow({ id: "a", seasons: seasons(4, 0) })), "unwatched");
  assert.equal(watchState(makeShow({ id: "b", seasons: seasons(4, 2) })), "in_progress");
  assert.equal(watchState(makeShow({ id: "c", seasons: seasons(4, 4) })), "complete");
});

test("hour-long shows go to the ballot one season at a time", () => {
  const show = makeShow({ id: "yellowstone", runtime: 60, seasons: seasons(5, 2) });
  assert.deepEqual(ballotFor(show, "hour"), { seasons: [3], label: "Season 3" });
});

test("a short half-hour series is voted on whole", () => {
  const show = makeShow({ id: "fleabag", runtime: 30, seasons: seasons(2) });
  assert.deepEqual(ballotFor(show, "half"), { seasons: [1, 2], label: "Whole series" });
});

test("a long half-hour series splits in half", () => {
  const show = makeShow({ id: "the-office", runtime: 30, seasons: seasons(9) });
  const ballot = ballotFor(show, "half");
  assert.deepEqual(ballot.seasons, [1, 2, 3, 4, 5]);
  assert.equal(ballot.label, "Seasons 1–5");

  // Second time around, the rest of the run is what is on offer.
  const halfDone = makeShow({ id: "the-office", runtime: 30, seasons: seasons(9, 5) });
  assert.deepEqual(ballotFor(halfDone, "half").seasons, [6, 7, 8, 9]);
});

test("a mini or anthology goes one season at a time even at half-hour length", () => {
  const show = makeShow({ id: "documentary-now", runtime: 30, format: "anthology", seasons: seasons(4, 1) });
  assert.deepEqual(ballotFor(show, "mini").seasons, [2]);
  assert.deepEqual(ballotFor(show, "half").seasons, [2]);
});

test("a fully watched show has nothing left to vote for", () => {
  const show = makeShow({ id: "over", seasons: seasons(2, 2) });
  assert.deepEqual(ballotFor(show, "hour"), { seasons: [], label: "Fully watched" });
});

test("Friday nights are two half-hours or one hour", () => {
  assert.equal(episodesPerWeek(makeShow({ id: "a", runtime: 30 })), 2);
  assert.equal(episodesPerWeek(makeShow({ id: "b", runtime: 60 })), 1);
});

test("the cheater check compares what each person spent", () => {
  const even = makeData([
    makeShow({ id: "a", votes: { weekly: { scotty: 10, shelby: 4 }, hour: { scotty: 0, shelby: 0 }, half: { scotty: 0, shelby: 0 }, mini: { scotty: 0, shelby: 0 } } }),
    makeShow({ id: "b", votes: { weekly: { scotty: 0, shelby: 6 }, hour: { scotty: 0, shelby: 0 }, half: { scotty: 0, shelby: 0 }, mini: { scotty: 0, shelby: 0 } } }),
  ]);
  assert.equal(ledgerBalanced(even, "weekly"), true);

  even.shows[1].votes.weekly.shelby = 5;
  assert.equal(ledgerBalanced(even, "weekly"), false);
});
