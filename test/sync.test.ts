import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOps, type Op } from "../src/lib/ops";
import { describe, filesTouched, intoDataset, outOfDataset, type ShowsFile } from "../src/lib/sync";
import type { InboxItem, Show } from "../src/lib/types";
import { makeShow } from "./helpers";

const item = (tmdbId: number, title: string): InboxItem => ({
  tmdbId,
  title,
  runtime: 60,
  suggestedAt: "2026-09-11T07:00:00.000Z",
});

/** Run ops through the same shaping the sync does, one file at a time. */
function saveAs(key: "shows" | "inbox", raw: unknown, ops: Op[]): unknown {
  return outOfDataset(key, applyOps(intoDataset(key, raw), ops));
}

test("accepting a suggestion writes to both files", () => {
  const ops: Op[] = [{ type: "inbox", tmdbId: 7, accept: true, show: makeShow({ id: "new-show" }) }];
  assert.deepEqual([...filesTouched(ops)], ["inbox", "shows"]);
});

test("dismissing one only touches the inbox", () => {
  const ops: Op[] = [{ type: "inbox", tmdbId: 7, accept: false }];
  assert.deepEqual([...filesTouched(ops)], ["inbox"]);
});

test("an accepted show really does land in shows.json", () => {
  const showsFile: ShowsFile = { people: ["scotty", "shelby"], budgets: {} as never, shows: [makeShow({ id: "a", title: "A" })] };
  const ops: Op[] = [
    { type: "inbox", tmdbId: 7, accept: true, show: makeShow({ id: "collision", title: "Collision" }) },
  ];

  const saved = saveAs("shows", showsFile, ops) as ShowsFile;
  assert.deepEqual(saved.shows.map((s) => s.id), ["a", "collision"]);
  // and the same ops clear it from the inbox file
  assert.deepEqual(saveAs("inbox", [item(7, "Collision")], ops), []);
});

test("a mix of accepts and dismissals keeps only the accepted ones", () => {
  const showsFile: ShowsFile = { people: [], budgets: {} as never, shows: [] };
  const ops: Op[] = [
    { type: "inbox", tmdbId: 1, accept: false },
    { type: "inbox", tmdbId: 2, accept: true, show: makeShow({ id: "kept", title: "Kept" }) },
    { type: "inbox", tmdbId: 3, accept: false },
  ];

  assert.deepEqual((saveAs("shows", showsFile, ops) as ShowsFile).shows.map((s) => s.id), ["kept"]);
  assert.deepEqual(saveAs("inbox", [item(1, "a"), item(2, "Kept"), item(3, "c")], ops), []);
});

test("a suggestion for a show already on the list clears without duplicating it", () => {
  const existing = makeShow({ id: "collision", title: "Collision" });
  const showsFile: ShowsFile = { people: [], budgets: {} as never, shows: [existing] };
  const ops: Op[] = [
    { type: "inbox", tmdbId: 7, accept: true, show: makeShow({ id: "collision", title: "Collision" }) },
  ];
  assert.deepEqual((saveAs("shows", showsFile, ops) as ShowsFile).shows.length, 1);
});

test("saving preserves the parts of shows.json no op touched", () => {
  const showsFile: ShowsFile = {
    people: ["scotty", "shelby"],
    displayNames: { scotty: "Scotty", shelby: "Shelby" },
    budgets: { weekly: 1500, hour: 750, half: 1000, mini: 500 },
    shows: [makeShow({ id: "a" })],
  };
  const saved = saveAs("shows", showsFile, [{ type: "vote", showId: "a", ledger: "hour", person: "scotty", points: 5 }]) as ShowsFile;
  assert.deepEqual(saved.people, ["scotty", "shelby"]);
  assert.deepEqual(saved.displayNames, { scotty: "Scotty", shelby: "Shelby" });
  assert.deepEqual(saved.budgets, { weekly: 1500, hour: 750, half: 1000, mini: 500 });
});

test("the commit message says which way the inbox went", () => {
  const show = makeShow({ id: "x" }) as Show;
  assert.equal(describe([{ type: "inbox", tmdbId: 1, accept: false }]), "Inbox: dismissed 1");
  assert.equal(
    describe([
      { type: "inbox", tmdbId: 1, accept: true, show },
      { type: "inbox", tmdbId: 2, accept: false },
    ]),
    "Inbox: added 1, dismissed 1",
  );
});
