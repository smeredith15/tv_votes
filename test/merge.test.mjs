import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeInbox, mergeShows } from "../scripts/merge_refresh.mjs";

const show = (id, extra = {}) => ({
  id,
  title: id,
  runtime: 60,
  format: "series",
  status: "unknown",
  tmdbId: null,
  poster: null,
  providers: [],
  providersUpdated: null,
  seasons: [],
  votes: { weekly: { scotty: 0, shelby: 0 }, hour: { scotty: 0, shelby: 0 }, half: { scotty: 0, shelby: 0 }, mini: { scotty: 0, shelby: 0 } },
  ...extra,
});

const wrap = (shows) => ({ people: ["scotty", "shelby"], budgets: {}, shows });

test("a vote cast during the refresh survives the merge", () => {
  const base = wrap([show("severance")]);
  const ours = wrap([show("severance", { tmdbId: 95396, status: "returning", providers: [{ name: "Apple TV+", type: "flatrate" }] })]);
  const theirs = wrap([show("severance", { votes: { ...show("x").votes, hour: { scotty: 50, shelby: 50 } } })]);

  const merged = mergeShows(base, ours, theirs);
  assert.deepEqual(merged.shows[0].votes.hour, { scotty: 50, shelby: 50 });
  assert.equal(merged.shows[0].status, "returning");
  assert.equal(merged.shows[0].tmdbId, 95396);
  assert.deepEqual(merged.shows[0].providers, [{ name: "Apple TV+", type: "flatrate" }]);
});

test("seasons come from TMDB but the watched ticks come from the branch", () => {
  const seasons = (n, watched = []) =>
    Array.from({ length: n }, (_, i) => ({ number: i + 1, episodes: 10, watched: watched.includes(i + 1) }));

  const base = wrap([show("yellowstone", { seasons: seasons(4) })]);
  // TMDB found a fifth season while someone was ticking off the third.
  const ours = wrap([show("yellowstone", { seasons: seasons(5), status: "returning" })]);
  const theirs = wrap([show("yellowstone", { seasons: seasons(4, [1, 2, 3]) })]);

  const merged = mergeShows(base, ours, theirs);
  assert.equal(merged.shows[0].seasons.length, 5);
  assert.deepEqual(merged.shows[0].seasons.map((s) => s.watched), [true, true, true, false, false]);
});

test("a correction made in the app outranks what TMDB guessed", () => {
  const base = wrap([show("bait", { runtime: null, format: "series" })]);
  const ours = wrap([show("bait", { runtime: 60, format: "documentary" })]);
  const theirs = wrap([show("bait", { runtime: 30, format: "series" })]);

  const merged = mergeShows(base, ours, theirs);
  assert.equal(merged.shows[0].runtime, 30);
  assert.equal(merged.shows[0].format, "series");
});

test("the refresh still fills in a field nobody has answered", () => {
  const base = wrap([show("mystery", { runtime: null })]);
  const ours = wrap([show("mystery", { runtime: 30 })]);
  const theirs = wrap([show("mystery", { runtime: null })]);

  assert.equal(mergeShows(base, ours, theirs).shows[0].runtime, 30);
});

test("a show accepted from the inbox mid-run is not wiped out", () => {
  const base = wrap([show("a")]);
  const ours = wrap([show("a", { status: "ended" })]);
  const theirs = wrap([show("a"), show("brand-new")]);

  const merged = mergeShows(base, ours, theirs);
  assert.deepEqual(merged.shows.map((s) => s.id), ["a", "brand-new"]);
  assert.equal(merged.shows[0].status, "ended");
});

test("a show deleted mid-run stays deleted", () => {
  const base = wrap([show("a"), show("unwanted")]);
  const ours = wrap([show("a"), show("unwanted", { status: "ended" })]);
  const theirs = wrap([show("a")]);

  assert.deepEqual(mergeShows(base, ours, theirs).shows.map((s) => s.id), ["a"]);
});

test("new suggestions are kept and dismissed ones stay dismissed", () => {
  const item = (tmdbId) => ({ tmdbId, title: `show ${tmdbId}`, runtime: 60, suggestedAt: "2026-01-01T00:00:00.000Z" });
  const base = [item(1), item(2)];
  const ours = [item(1), item(2), item(3)]; // this run found 3
  const theirs = [item(1)]; // meanwhile 2 was dismissed in the app

  assert.deepEqual(mergeInbox(base, ours, theirs).map((i) => i.tmdbId), [1, 3]);
});

test("a suggestion accepted mid-run is not re-queued", () => {
  const item = (tmdbId) => ({ tmdbId, title: `show ${tmdbId}`, runtime: 60, suggestedAt: "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(mergeInbox([], [item(9)], [item(9)]).map((i) => i.tmdbId), [9]);
});
