import assert from "node:assert/strict";
import { test } from "node:test";
import { totalWeight } from "../src/lib/draw";
import type { Dataset, LedgerId } from "../src/lib/types";
import { makeData, makeShow } from "./helpers";

/**
 * With one name picked, nothing on screen may give away the other person's
 * picks or their total — including by arithmetic.
 */
function visibleToVoter(data: Dataset, ledger: LedgerId, voter: string) {
  const backed = data.shows.filter((s) => (s.votes[ledger]?.[voter] ?? 0) > 0);
  return {
    titles: backed.map((s) => s.title),
    ownTotal: backed.reduce((sum, s) => sum + (s.votes[ledger]?.[voter] ?? 0), 0),
  };
}

const ballot = (): Dataset =>
  makeData([
    makeShow({
      id: "his",
      title: "His Pick",
      votes: { weekly: { scotty: 40, shelby: 0 }, hour: { scotty: 0, shelby: 0 }, half: { scotty: 0, shelby: 0 }, mini: { scotty: 0, shelby: 0 } },
    }),
    makeShow({
      id: "hers",
      title: "Her Pick",
      votes: { weekly: { scotty: 0, shelby: 60 }, hour: { scotty: 0, shelby: 0 }, half: { scotty: 0, shelby: 0 }, mini: { scotty: 0, shelby: 0 } },
    }),
  ]);

test("a sealed ballot lists only your own picks", () => {
  const seen = visibleToVoter(ballot(), "weekly", "scotty");
  assert.deepEqual(seen.titles, ["His Pick"]);
  assert.equal(seen.ownTotal, 40);
});

test("the combined ticket count is what would leak the hidden total", () => {
  // 100 on screen minus the 40 you know is yours names her 60 exactly, which
  // is why the sealed header shows a count of your own shows instead.
  const data = ballot();
  assert.equal(totalWeight(data, "weekly"), 100);
  assert.equal(totalWeight(data, "weekly") - visibleToVoter(data, "weekly", "scotty").ownTotal, 60);
});

test("with Both picked, the whole ballot is visible again", () => {
  const data = ballot();
  const everyone = data.shows.filter((s) =>
    data.people.some((p) => (s.votes.weekly?.[p] ?? 0) > 0),
  );
  assert.deepEqual(everyone.map((s) => s.title), ["His Pick", "Her Pick"]);
  assert.equal(totalWeight(data, "weekly"), 100);
});
