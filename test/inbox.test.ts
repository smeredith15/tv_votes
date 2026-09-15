import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOps, cloneForOps, type Op } from "../src/lib/ops";
import { datasetFrom, serialize } from "../src/lib/sync";
import { makeData, makeShow } from "./helpers";
import type { InboxItem } from "../src/lib/types";

const item = (tmdbId: number, title: string): InboxItem => ({
  tmdbId,
  title,
  runtime: 60,
  suggestedAt: "2026-09-15T07:00:00.000Z",
});

test("turning a suggestion down is remembered", () => {
  const data = makeData([]);
  data.inbox = [item(7, "Not For Us")];
  applyOps(data, [{ type: "inbox", tmdbId: 7, accept: false }]);

  assert.deepEqual(data.inbox, []);
  assert.deepEqual(data.dismissed, [7]);
});

test("a show turned down before is not suggested again", () => {
  // This is the nightly job's suggestion arriving a second time.
  const data = makeData([]);
  data.dismissed = [7];
  applyOps(data, [{ type: "inboxSuggest", item: item(7, "Not For Us") }]);
  assert.deepEqual(data.inbox, []);
});

test("accepting is not a refusal", () => {
  const data = makeData([]);
  data.inbox = [item(7, "Yes Please")];
  applyOps(data, [
    { type: "inbox", tmdbId: 7, accept: true, show: makeShow({ id: "yes-please", tmdbId: 7 }) },
  ]);
  assert.deepEqual(data.dismissed, []);
  assert.equal(data.shows.length, 1);
});

test("the same refusal twice is recorded once", () => {
  const data = makeData([]);
  applyOps(data, [
    { type: "inbox", tmdbId: 7, accept: false },
    { type: "inbox", tmdbId: 7, accept: false },
  ]);
  assert.deepEqual(data.dismissed, [7]);
});

test("refusals can be forgotten so the suggestions come round again", () => {
  const data = makeData([]);
  data.dismissed = [7, 8];
  applyOps(data, [{ type: "clearDismissed" }]);
  assert.deepEqual(data.dismissed, []);
});

test("refusals survive a save, and an older bare-array file still reads", () => {
  const data = makeData([]);
  data.inbox = [item(9, "Waiting")];
  data.dismissed = [7];
  const files = serialize(data);

  const round = datasetFrom(files);
  assert.deepEqual(round.dismissed, [7]);
  assert.deepEqual(round.inbox.map((i) => i.tmdbId), [9]);

  // The shape before refusals were kept: a plain list of suggestions.
  const legacy = datasetFrom({ ...files, "data/inbox.json": JSON.stringify([item(9, "Waiting")]) });
  assert.deepEqual(legacy.dismissed, []);
  assert.deepEqual(legacy.inbox.map((i) => i.tmdbId), [9]);
});

test("a refusal does not leak back through the cheap copy", () => {
  const base = makeData([]);
  const ops: Op[] = [{ type: "inbox", tmdbId: 7, accept: false }];
  const next = applyOps(cloneForOps(base, ops), ops);
  assert.deepEqual(next.dismissed, [7]);
  assert.deepEqual(base.dismissed, []);
});
