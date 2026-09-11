import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeBase64 } from "../src/lib/github";
import { applyOps, type Op } from "../src/lib/ops";
import { ALL_FILES, FILES, changedFiles, datasetFrom, describe, serialize } from "../src/lib/sync";
import type { Show } from "../src/lib/types";
import { makeData, makeShow } from "./helpers";

function filesFor(shows: Show[], inbox: unknown[] = []): Record<string, string> {
  const data = makeData(shows);
  return serialize({ ...data, inbox: inbox as never });
}

/** What a save does: read the files, replay the ops, write back what changed. */
function saveThrough(files: Record<string, string>, ops: Op[]): Record<string, string> {
  return changedFiles(files, serialize(applyOps(datasetFrom(files), ops)));
}

test("the four files round-trip through a save unchanged when nothing happened", () => {
  const files = filesFor([makeShow({ id: "a", title: "A" })]);
  assert.deepEqual(Object.keys(files).sort(), [...ALL_FILES].sort());
  assert.deepEqual(saveThrough(files, []), {});
});

test("a vote rewrites only shows.json", () => {
  const files = filesFor([makeShow({ id: "a", title: "A" })]);
  const changed = saveThrough(files, [{ type: "vote", showId: "a", ledger: "hour", person: "scotty", points: 30 }]);

  assert.deepEqual(Object.keys(changed), [FILES.shows]);
  assert.equal(datasetFrom({ ...files, ...changed }).shows[0].votes.hour.scotty, 30);
});

test("accepting a suggestion rewrites both files in one go", () => {
  const files = filesFor([makeShow({ id: "a", title: "A" })], [{ tmdbId: 7, title: "Collision", runtime: 60, suggestedAt: "x" }]);
  const changed = saveThrough(files, [
    { type: "inbox", tmdbId: 7, accept: true, show: makeShow({ id: "collision", title: "Collision" }) },
  ]);

  // One commit covering both, rather than a commit each.
  assert.deepEqual(Object.keys(changed).sort(), [FILES.inbox, FILES.shows].sort());
  const after = datasetFrom({ ...files, ...changed });
  assert.deepEqual(after.shows.map((s) => s.id), ["a", "collision"]);
  assert.deepEqual(after.inbox, []);
});

test("dismissing leaves shows.json alone", () => {
  const files = filesFor([makeShow({ id: "a", title: "A" })], [{ tmdbId: 7, title: "No", runtime: 60, suggestedAt: "x" }]);
  assert.deepEqual(Object.keys(saveThrough(files, [{ type: "inbox", tmdbId: 7, accept: false }])), [FILES.inbox]);
});

test("everything the ops did not touch survives the round trip", () => {
  const data = makeData([makeShow({ id: "a", title: "A" })]);
  data.displayNames = { scotty: "Scotty", shelby: "Shelby" };
  const files = serialize(data);
  const after = datasetFrom({ ...files, ...saveThrough(files, [{ type: "vote", showId: "a", ledger: "hour", person: "scotty", points: 1 }]) });

  assert.deepEqual(after.people, ["scotty", "shelby"]);
  assert.deepEqual(after.displayNames, { scotty: "Scotty", shelby: "Shelby" });
  assert.deepEqual(after.budgets, data.budgets);
});

test("a shows file past a megabyte still round-trips", () => {
  // The contents API silently returns nothing above 1 MB, which is what broke
  // reading once TMDB filled in every season and provider. Blobs do not care.
  const many = Array.from({ length: 1200 }, (_, i) =>
    makeShow({
      id: `show-${i}`,
      title: `Show Number ${i}`,
      seasons: Array.from({ length: 6 }, (_, n) => ({ number: n + 1, episodes: 10, watched: false })),
      providers: [{ name: "A Streaming Service", type: "flatrate" as const, logo: "/logo.jpg" }],
    }),
  );
  const files = filesFor(many);
  assert.ok(files[FILES.shows].length > 1_048_576, `only ${files[FILES.shows].length} bytes`);

  const changed = saveThrough(files, [{ type: "vote", showId: "show-900", ledger: "hour", person: "shelby", points: 12 }]);
  assert.equal(datasetFrom({ ...files, ...changed }).shows[900].votes.hour.shelby, 12);
});

test("base64 encoding survives a large payload and non-ASCII titles", () => {
  const text = `${"x".repeat(2_000_000)} Alıkara — Señor`;
  const round = new TextDecoder().decode(Uint8Array.from(atob(encodeBase64(text)), (c) => c.charCodeAt(0)));
  assert.equal(round, text);
});

test("the commit message says which way the inbox went", () => {
  const show = makeShow({ id: "x" });
  assert.equal(describe([{ type: "inbox", tmdbId: 1, accept: false }]), "Inbox: dismissed 1");
  assert.equal(
    describe([
      { type: "inbox", tmdbId: 1, accept: true, show },
      { type: "inbox", tmdbId: 2, accept: false },
    ]),
    "Inbox: added 1, dismissed 1",
  );
});
