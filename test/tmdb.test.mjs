import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestMatch,
  matchKey,
  toProviders,
  toReturningStatus,
  toRuntime,
  toSeasons,
} from "../scripts/tmdb.mjs";

test("TMDB statuses collapse to returning, ended, or unknown", () => {
  assert.equal(toReturningStatus({ status: "Returning Series" }), "returning");
  assert.equal(toReturningStatus({ status: "In Production" }), "returning");
  assert.equal(toReturningStatus({ status: "Ended" }), "ended");
  assert.equal(toReturningStatus({ status: "Canceled" }), "ended");
  assert.equal(toReturningStatus({ status: "Planned" }), "unknown");
  assert.equal(toReturningStatus({}), "unknown");
  assert.equal(toReturningStatus(null), "unknown");
});

test("the runtime split sits at 40 minutes", () => {
  assert.equal(toRuntime({ episode_run_time: [22] }), 30);
  assert.equal(toRuntime({ episode_run_time: [39] }), 30);
  assert.equal(toRuntime({ episode_run_time: [40] }), 60);
  assert.equal(toRuntime({ episode_run_time: [58] }), 60);
  assert.equal(toRuntime({ episode_run_time: [28, 32] }), 30);
  assert.equal(toRuntime({}), null);
});

test("runtime falls back to the last aired episode", () => {
  assert.equal(toRuntime({ episode_run_time: [], last_episode_to_air: { runtime: 47 } }), 60);
});

test("subscription services outrank renting the same show", () => {
  const providers = toProviders({
    flatrate: [{ provider_name: "Max", logo_path: "/m.jpg" }],
    rent: [{ provider_name: "Max" }, { provider_name: "Apple TV" }],
  });
  assert.deepEqual(providers, [
    { name: "Max", type: "flatrate", logo: "/m.jpg" },
    { name: "Apple TV", type: "rent", logo: null },
  ]);
});

test("a show nobody streams comes back empty rather than broken", () => {
  assert.deepEqual(toProviders(null), []);
  assert.deepEqual(toProviders({}), []);
});

test("specials are not seasons, and ticks survive a refresh", () => {
  const seasons = toSeasons(
    {
      seasons: [
        { season_number: 0, episode_count: 4, name: "Specials" },
        { season_number: 1, episode_count: 10, name: "Season 1", air_date: "2019-01-01" },
        { season_number: 2, episode_count: 8, name: "Season 2" },
        { season_number: 3, episode_count: 0, name: "Season 3" },
      ],
    },
    [{ number: 1, episodes: 10, watched: true }],
  );
  assert.deepEqual(seasons, [
    { number: 1, name: "Season 1", episodes: 10, airDate: "2019-01-01", watched: true },
    { number: 2, name: "Season 2", episodes: 8, airDate: null, watched: false },
  ]);
});

test("titles match across articles and punctuation", () => {
  assert.equal(matchKey("The 100"), matchKey("100, The"));
  assert.equal(matchKey("Bob's Burgers"), matchKey("Bobs Burgers"));
  assert.notEqual(matchKey("Yellowstone"), matchKey("Yellowjackets"));
});

test("a near miss is left unmatched rather than guessed at", () => {
  const results = [
    { id: 1, name: "The Office", popularity: 50 },
    { id: 2, name: "The Office Ladies", popularity: 90 },
  ];
  assert.equal(bestMatch("The Office", results).id, 1);
  assert.equal(bestMatch("Severance", results), null);
});

test("among exact title matches, the popular one wins", () => {
  const results = [
    { id: 1, name: "The Flash", popularity: 12 },
    { id: 2, name: "The Flash", popularity: 88 },
  ];
  assert.equal(bestMatch("The Flash", results).id, 2);
});
