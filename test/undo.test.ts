import assert from "node:assert/strict";
import { test } from "node:test";
import { compact, type Op } from "../src/lib/ops";

/**
 * The queue's history, as the store keeps it: the pending list before each
 * action, so taking one back is restoring the list as it stood.
 */
interface Queue {
  pending: Op[];
  undo: Op[][];
}

const DEPTH = 30;

function dispatch(queue: Queue, ...ops: Op[]): Queue {
  return {
    pending: compact([...queue.pending, ...ops]),
    undo: [...queue.undo, queue.pending].slice(-DEPTH),
  };
}

function undo(queue: Queue): Queue {
  if (queue.undo.length === 0) return queue;
  return { pending: queue.undo[queue.undo.length - 1], undo: queue.undo.slice(0, -1) };
}

function discard(queue: Queue): Queue {
  return { pending: [], undo: [...queue.undo, queue.pending].slice(-DEPTH) };
}

const empty: Queue = { pending: [], undo: [] };
const free = (showId: string): Op => ({ type: "freePoints", showId, ledger: "half" });

test("one wrong press is one press to put right", () => {
  // Exactly the accident: "take back all" cleared three shows at once.
  const voted = dispatch(empty, { type: "vote", showId: "a", ledger: "half", person: "scotty", points: 25 });
  const oops = dispatch(voted, free("ponies"), free("riot-women"), free("why-women-kill"));
  assert.equal(oops.pending.length, 4);

  const fixed = undo(oops);
  assert.deepEqual(fixed.pending, voted.pending, "back to just the vote");
  assert.equal(fixed.pending.length, 1);
});

test("a bulk action undoes as one, however many shows it touched", () => {
  const after = dispatch(empty, free("a"), free("b"), free("c"), free("d"));
  assert.equal(after.pending.length, 4);
  assert.deepEqual(undo(after).pending, []);
});

test("undo steps back through several actions in turn", () => {
  const one = dispatch(empty, { type: "vote", showId: "a", ledger: "half", person: "scotty", points: 1 });
  const two = dispatch(one, { type: "vote", showId: "b", ledger: "half", person: "scotty", points: 2 });
  const three = dispatch(two, { type: "vote", showId: "c", ledger: "half", person: "scotty", points: 3 });

  assert.deepEqual(undo(three).pending, two.pending);
  assert.deepEqual(undo(undo(three)).pending, one.pending);
  assert.deepEqual(undo(undo(undo(three))).pending, []);
});

test("undoing with nothing to undo changes nothing", () => {
  assert.deepEqual(undo(empty), empty);
});

test("undo survives the collapsing of repeated edits to one field", () => {
  // Typing into a points box repeatedly collapses to a single op; undo still
  // restores the queue as it was before that typing began.
  const before = dispatch(empty, { type: "vote", showId: "a", ledger: "half", person: "scotty", points: 10 });
  let after = before;
  for (const points of [20, 30, 40]) {
    after = dispatch(after, { type: "vote", showId: "b", ledger: "half", person: "scotty", points });
  }
  assert.equal(after.pending.length, 2, "two fields touched, however many keystrokes");

  let stepped = after;
  for (let i = 0; i < 3; i++) stepped = undo(stepped);
  assert.deepEqual(stepped.pending, before.pending);
});

test("discarding drops everything and is itself undoable", () => {
  const some = dispatch(empty, free("a"), free("b"));
  const cleared = discard(some);
  assert.deepEqual(cleared.pending, []);
  assert.deepEqual(undo(cleared).pending, some.pending, "a mis-click on discard is recoverable too");
});

test("the history does not grow without bound", () => {
  let queue = empty;
  for (let i = 0; i < DEPTH + 20; i++) {
    queue = dispatch(queue, { type: "vote", showId: `s${i}`, ledger: "half", person: "scotty", points: i });
  }
  assert.equal(queue.undo.length, DEPTH);
});
