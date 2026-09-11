import assert from "node:assert/strict";
import { test } from "node:test";
import { DrawError, drawWinner, tickets, totalWeight, verifyDraw } from "../src/lib/draw";
import type { Dataset } from "../src/lib/types";
import { makeData, makeShow } from "./helpers";

function ledgerData(weights: Record<string, [number, number]>): Dataset {
  return makeData(
    Object.entries(weights).map(([id, [scotty, shelby]]) =>
      makeShow({
        id,
        title: id,
        votes: {
          weekly: { scotty, shelby },
          hour: { scotty: 0, shelby: 0 },
          half: { scotty: 0, shelby: 0 },
          mini: { scotty: 0, shelby: 0 },
        },
      }),
    ),
  );
}

test("only shows with points get a ticket", () => {
  const data = ledgerData({ a: [5, 5], b: [0, 0], c: [10, 0] });
  assert.deepEqual(
    tickets(data, "weekly").map((t) => [t.show.id, t.weight, t.cumulative]),
    [
      ["a", 10, 10],
      ["c", 10, 20],
    ],
  );
  assert.equal(totalWeight(data, "weekly"), 20);
});

test("a lopsided ledger refuses to draw", () => {
  const data = ledgerData({ a: [10, 5] });
  assert.throws(() => drawWinner(data, "weekly"), DrawError);
});

test("an empty ledger refuses to draw", () => {
  assert.throws(() => drawWinner(ledgerData({}), "weekly"), DrawError);
});

test("the same seed always produces the same winner", () => {
  const data = ledgerData({ a: [30, 30], b: [10, 10], c: [5, 5] });
  const first = drawWinner(data, "weekly", "cafebabe");
  const second = drawWinner(data, "weekly", "cafebabe");
  assert.equal(first.winnerId, second.winnerId);
  assert.equal(first.roll, second.roll);
  assert.equal(verifyDraw(first), true);
});

test("a doctored result fails verification", () => {
  const data = ledgerData({ a: [30, 30], b: [10, 10] });
  const draw = drawWinner(data, "weekly", "0123456789abcdef");
  assert.equal(verifyDraw({ ...draw, roll: draw.roll + 1 }), false);
});

test("every roll in range lands on exactly one show", () => {
  const data = ledgerData({ a: [3, 0], b: [0, 2], c: [1, 1] });
  const pool = tickets(data, "weekly");
  const total = totalWeight(data, "weekly");
  assert.equal(total, 7);

  const hits: string[] = [];
  for (let roll = 1; roll <= total; roll++) {
    const winner = pool.find((t) => roll <= t.cumulative);
    assert.ok(winner, `roll ${roll} matched nothing`);
    hits.push(winner.show.id);
  }
  // Three tickets for a, two for b, two for c — nobody is cheated a slot.
  assert.deepEqual(hits, ["a", "a", "a", "b", "b", "c", "c"]);
});

test("winners come up about as often as the points they were given", () => {
  const data = ledgerData({ big: [60, 0], small: [0, 60], tiny: [10, 10] });
  const counts: Record<string, number> = { big: 0, small: 0, tiny: 0 };
  for (let i = 0; i < 6000; i++) {
    counts[drawWinner(data, "weekly", `seed-${i}`).winnerId]++;
  }
  // big and small hold 60/140 each, tiny 20/140.
  assert.ok(Math.abs(counts.big / 6000 - 0.4286) < 0.03, `big drawn ${counts.big}`);
  assert.ok(Math.abs(counts.small / 6000 - 0.4286) < 0.03, `small drawn ${counts.small}`);
  assert.ok(Math.abs(counts.tiny / 6000 - 0.1429) < 0.03, `tiny drawn ${counts.tiny}`);
});

test("a draw records both allocations and the full standings", () => {
  const data = ledgerData({ a: [30, 10], b: [0, 20] });
  const draw = drawWinner(data, "weekly", "abc123");
  assert.deepEqual(draw.allocations, {
    scotty: { a: 30 },
    shelby: { a: 10, b: 20 },
  });
  assert.deepEqual(draw.standings, [
    { id: "a", title: "a", weight: 40 },
    { id: "b", title: "b", weight: 20 },
  ]);
  assert.ok(draw.roll >= 1 && draw.roll <= 60);
});

test("shows that are off the ballot cannot win it", () => {
  const data = ledgerData({ a: [10, 10] });
  data.shows.push(
    makeShow({
      id: "mcu-member",
      universe: "mcu",
      votes: {
        weekly: { scotty: 500, shelby: 500 },
        hour: { scotty: 0, shelby: 0 },
        half: { scotty: 0, shelby: 0 },
        mini: { scotty: 0, shelby: 0 },
      },
    }),
  );
  assert.deepEqual(tickets(data, "weekly").map((t) => t.show.id), ["a"]);
});
