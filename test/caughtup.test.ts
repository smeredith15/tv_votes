import assert from "node:assert/strict";
import { test } from "node:test";
import { caughtUp, effectiveSpent, eligibleLedgers, ledgerBalanced, strandedShows } from "../src/lib/ledgers";
import { makeData, makeShow, seasons } from "./helpers";

test("caught up means every aired season ticked, ended or not", () => {
  assert.equal(caughtUp(makeShow({ id: "a", seasons: seasons(3, 3) })), true);
  assert.equal(caughtUp(makeShow({ id: "b", seasons: seasons(3, 3), status: "returning" })), true);
  assert.equal(caughtUp(makeShow({ id: "c", seasons: seasons(3, 2) })), false);
  // No season list yet is not the same as nothing left to watch.
  assert.equal(caughtUp(makeShow({ id: "d", seasons: [] })), false);
});

test("a show still coming back is off the ballots while you are caught up", () => {
  // It used to stay votable because it was returning, so the ballots offered
  // shows with nothing to watch — The Witcher among them.
  const show = makeShow({ id: "witcher", runtime: 60, status: "returning", seasons: seasons(4, 4) });
  assert.deepEqual(eligibleLedgers(show), []);
});

test("a new season puts it back on the ballots", () => {
  const show = makeShow({ id: "witcher", runtime: 60, status: "returning", seasons: seasons(5, 4) });
  assert.deepEqual(eligibleLedgers(show), ["weekly", "hour"]);
});

test("a show with no season list yet stays votable", () => {
  // Nothing knows its seasons until TMDB is asked; that is not "caught up".
  const show = makeShow({ id: "new", runtime: null, seasons: [] });
  assert.deepEqual(eligibleLedgers(show), ["weekly"]);
});

test("points left on a caught-up show are reported as stranded", () => {
  const data = makeData([
    makeShow({
      id: "witcher",
      title: "The Witcher",
      runtime: 60,
      status: "returning",
      seasons: seasons(4, 4),
      votes: {
        weekly: { scotty: 9, shelby: 400 },
        hour: { scotty: 150, shelby: 750 },
        half: { scotty: 0, shelby: 0 },
        mini: { scotty: 0, shelby: 0 },
      },
    }),
    makeShow({ id: "live", runtime: 60, seasons: seasons(2, 0) }),
  ]);

  assert.deepEqual(strandedShows(data, "hour").map((s) => s.id), ["witcher"]);
  // Neither of those totals counts toward what the draw would use.
  assert.equal(effectiveSpent(data, "hour", "scotty"), 0);
  assert.equal(effectiveSpent(data, "hour", "shelby"), 0);
});

test("a ballot propped up by a caught-up show stops being level", () => {
  // This is what happens on the hour ballot: Shelby's whole spend sits on a
  // show that is now caught up, so it buys nothing and the totals no longer
  // match until she places it somewhere that can still win.
  const data = makeData([
    makeShow({
      id: "witcher",
      runtime: 60,
      status: "returning",
      seasons: seasons(4, 4),
      votes: {
        weekly: { scotty: 0, shelby: 0 },
        hour: { scotty: 0, shelby: 750 },
        half: { scotty: 0, shelby: 0 },
        mini: { scotty: 0, shelby: 0 },
      },
    }),
    makeShow({
      id: "live",
      runtime: 60,
      seasons: seasons(2, 0),
      votes: {
        weekly: { scotty: 0, shelby: 0 },
        hour: { scotty: 750, shelby: 0 },
        half: { scotty: 0, shelby: 0 },
        mini: { scotty: 0, shelby: 0 },
      },
    }),
  ]);

  assert.equal(ledgerBalanced(data, "hour"), false);
  assert.equal(effectiveSpent(data, "hour", "scotty"), 750);
  assert.equal(effectiveSpent(data, "hour", "shelby"), 0);

  // Moving it onto something that can win puts the ballot right.
  data.shows[0].votes.hour = { scotty: 0, shelby: 0 };
  data.shows[1].votes.hour = { scotty: 750, shelby: 750 };
  assert.equal(ledgerBalanced(data, "hour"), true);
});
