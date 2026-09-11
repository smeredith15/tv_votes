import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTmdbId, showFromTmdb, uniqueId } from "../src/lib/addShow";

test("an id is read from a number or a TMDB page URL", () => {
  assert.equal(parseTmdbId("1396"), 1396);
  assert.equal(parseTmdbId("  1396  "), 1396);
  assert.equal(parseTmdbId("https://www.themoviedb.org/tv/1396-breaking-bad"), 1396);
  assert.equal(parseTmdbId("themoviedb.org/tv/95396"), 95396);
  assert.equal(parseTmdbId("https://www.themoviedb.org/tv/2316-the-office/seasons"), 2316);
});

test("anything that is not an id is left to be searched for", () => {
  assert.equal(parseTmdbId("The Office"), null);
  assert.equal(parseTmdbId(""), null);
  assert.equal(parseTmdbId("11.22.63"), null);
  assert.equal(parseTmdbId("https://www.imdb.com/title/tt0386676/"), null);
});

test("a second show with the same name gets its year, not a clash", () => {
  const taken = new Set(["office"]);
  assert.equal(uniqueId("The Office", "2001", taken), "office-2001");
  assert.equal(uniqueId("The Office", null, new Set()), "office");
  // Both taken already: fall through to a number rather than overwrite.
  assert.equal(uniqueId("The Office", "2001", new Set(["office", "office-2001"])), "office-2001-2");
});

const details = {
  id: 1396,
  name: "Breaking Bad",
  first_air_date: "2008-01-20",
  poster_path: "/poster.jpg",
  status: "Ended",
  episode_run_time: [47],
  seasons: [
    { season_number: 0, episode_count: 3, name: "Specials" },
    { season_number: 1, episode_count: 7, name: "Season 1", air_date: "2008-01-20" },
    { season_number: 2, episode_count: 13, name: "Season 2" },
  ],
};

test("a show added by id arrives ready to vote on", () => {
  const show = showFromTmdb(details, { flatrate: [{ provider_name: "Netflix" }] }, {
    people: ["scotty", "shelby"],
    taken: new Set(),
    watched: false,
  });

  assert.equal(show.id, "breaking-bad");
  assert.equal(show.tmdbId, 1396);
  assert.equal(show.runtime, 60, "runtime decides which ballots it lands on");
  assert.equal(show.status, "ended");
  assert.deepEqual(show.seasons.map((s) => s.number), [1, 2], "specials are not seasons");
  assert.deepEqual(show.providers, [{ name: "Netflix", type: "flatrate", logo: null }]);
  assert.deepEqual(show.votes.hour, { scotty: 0, shelby: 0 });
});

test("adding one you have already seen marks every season watched", () => {
  const show = showFromTmdb(details, null, { people: ["scotty"], taken: new Set(), watched: true });
  assert.deepEqual(show.seasons.map((s) => s.watched), [true, true]);
});

test("a show TMDB knows nothing about still comes out usable", () => {
  const show = showFromTmdb({ id: 9, name: "Something New" }, null, {
    people: ["scotty"],
    taken: new Set(),
    watched: false,
  });
  assert.equal(show.runtime, null);
  assert.equal(show.status, "unknown");
  assert.deepEqual(show.seasons, []);
  assert.deepEqual(show.providers, []);
});
