import assert from "node:assert/strict";
import { test } from "node:test";
import { indexShows, matchShow, seasonNumbers, tmdbIdOf } from "../scripts/plex.mjs";

const shows = [
  { id: "witcher", title: "The Witcher", tmdbId: 71912 },
  { id: "wire", title: "The Wire", tmdbId: 1438 },
  { id: "chair-company", title: "The Chair Company", tmdbId: null },
];

test("specials and malformed entries are not seasons", () => {
  assert.deepEqual(
    seasonNumbers([{ index: 0 }, { index: 2 }, { index: 1 }, { index: null }, {}, { index: 1 }]),
    [1, 2],
  );
  assert.deepEqual(seasonNumbers(), []);
});

test("the TMDB id Plex recorded is read out of its guids", () => {
  assert.equal(tmdbIdOf({ Guid: [{ id: "imdb://tt0903747" }, { id: "tmdb://1396" }] }), 1396);
  assert.equal(tmdbIdOf({ Guid: [{ id: "tvdb://81189" }] }), null);
  assert.equal(tmdbIdOf({}), null);
});

test("a show matches on its TMDB id even when the title differs", () => {
  const { byTmdb, byTitle } = indexShows(shows);
  const entry = { title: "Witcher, The (2019)", Guid: [{ id: "tmdb://71912" }] };
  assert.equal(matchShow(entry, byTmdb, byTitle)?.id, "witcher");
});

test("a show with no guid still matches on title, articles aside", () => {
  const { byTmdb, byTitle } = indexShows(shows);
  assert.equal(matchShow({ title: "Chair Company, The" }, byTmdb, byTitle)?.id, "chair-company");
  assert.equal(matchShow({ title: "The Chair Company" }, byTmdb, byTitle)?.id, "chair-company");
});

test("something not on the ledger matches nothing rather than guessing", () => {
  const { byTmdb, byTitle } = indexShows(shows);
  assert.equal(matchShow({ title: "Some Show We Never Listed" }, byTmdb, byTitle), null);
  assert.equal(matchShow({ title: "Nope", Guid: [{ id: "tmdb://999999" }] }, byTmdb, byTitle), null);
});
