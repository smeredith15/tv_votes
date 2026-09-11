import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveSpent, ledgerBalanced } from "../src/lib/ledgers";
import { makeData, makeShow, seasons } from "./helpers";
import type { Dataset } from "../src/lib/types";

function ballot(weights: Record<string, [number, number]>, extra: Partial<Dataset> = {}): Dataset {
  return {
    ...makeData(
      Object.entries(weights).map(([id, [scotty, shelby]]) =>
        makeShow({
          id,
          title: id,
          runtime: 60,
          votes: {
            weekly: { scotty, shelby },
            hour: { scotty: 0, shelby: 0 },
            half: { scotty: 0, shelby: 0 },
            mini: { scotty: 0, shelby: 0 },
          },
        }),
      ),
    ),
    ...extra,
  };
}

test("a ballot is level whenever the two totals match, whatever they are", () => {
  // There is no target to hit — 40 each is as valid as 1500 each.
  assert.equal(ledgerBalanced(ballot({ a: [40, 0], b: [0, 40] }), "weekly"), true);
  assert.equal(ledgerBalanced(ballot({ a: [1500, 0], b: [0, 1500] }), "weekly"), true);
  assert.equal(ledgerBalanced(ballot({ a: [0, 0] }), "weekly"), true);
});

test("a ballot is not level when one has placed more than the other", () => {
  assert.equal(ledgerBalanced(ballot({ a: [41, 0], b: [0, 40] }), "weekly"), false);
});

test("what is left to place is the gap between the two", () => {
  const data = ballot({ a: [960, 0], b: [0, 800] });
  const spends = data.people.map((p) => effectiveSpent(data, "weekly", p));
  const highest = Math.max(...spends);
  assert.deepEqual(spends, [960, 800]);
  assert.equal(highest - spends[1], 160, "Shelby still has 160 to place");
});

test("points on a finished show count toward neither total", () => {
  const data = ballot({ live: [100, 100] });
  data.shows.push(
    makeShow({
      id: "done",
      seasons: seasons(2, 2),
      votes: {
        weekly: { scotty: 50, shelby: 0 },
        hour: { scotty: 0, shelby: 0 },
        half: { scotty: 0, shelby: 0 },
        mini: { scotty: 0, shelby: 0 },
      },
    }),
  );
  assert.equal(effectiveSpent(data, "weekly", "scotty"), 100);
  assert.equal(ledgerBalanced(data, "weekly"), true);
});
