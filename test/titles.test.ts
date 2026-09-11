import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOps } from "../src/lib/ops";
import { insertionIndex, slugify, sortKey } from "../src/lib/titles";
import { makeData, makeShow } from "./helpers";

test("leading and trailing articles are ignored when sorting", () => {
  assert.equal(sortKey("The 100"), "100");
  assert.equal(sortKey("100, The"), "100");
  assert.equal(sortKey("A League of Their Own"), "league of their own");
});

test("slugs match the ids the workbook import produced", () => {
  assert.equal(slugify("The Witcher"), "witcher");
  assert.equal(slugify("Bob's Burgers"), "bob-s-burgers");
  assert.equal(slugify("24: Legacy"), "24-legacy");
});

test("a title slots into its alphabetical place", () => {
  const titles = ["Alias", "Breaking Bad", "The Wire"];
  assert.equal(insertionIndex(titles, "American Gods"), 1);
  assert.equal(insertionIndex(titles, "Zoo"), 3);
  // The article is not part of the sort, so this files under S, between
  // "Breaking Bad" and "The Wire" — the same way the workbook ordered them.
  assert.equal(insertionIndex(titles, "A Small Light"), 2);
  assert.equal(insertionIndex(titles, "The Affair"), 0);
});

test("an accepted show is filed alphabetically, not dumped at the end", () => {
  // The list runs to a thousand rows and the view shows the first few hundred,
  // so appending would read as the show never having been added.
  const data = makeData([
    makeShow({ id: "alias", title: "Alias" }),
    makeShow({ id: "breaking-bad", title: "Breaking Bad" }),
    makeShow({ id: "wire", title: "The Wire" }),
  ]);
  applyOps(data, [
    { type: "inbox", tmdbId: 1, accept: true, show: makeShow({ id: "collision", title: "Collision" }) },
  ]);
  assert.deepEqual(data.shows.map((s) => s.title), ["Alias", "Breaking Bad", "Collision", "The Wire"]);
});

test("addShow files alphabetically too", () => {
  const data = makeData([makeShow({ id: "alias", title: "Alias" }), makeShow({ id: "wire", title: "The Wire" })]);
  applyOps(data, [{ type: "addShow", show: makeShow({ id: "dexter", title: "Dexter" }) }]);
  assert.deepEqual(data.shows.map((s) => s.title), ["Alias", "Dexter", "The Wire"]);
});
