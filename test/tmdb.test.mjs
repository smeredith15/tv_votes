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
    { number: 1, name: "Season 1", episodes: 10, aired: 10, airDate: "2019-01-01", watched: true },
    // No date and nothing aired to go by: taken as not out yet.
    { number: 2, name: "Season 2", episodes: 8, aired: 0, airDate: null, watched: false },
  ]);
});

test("a season still going out counts only the episodes that have aired", () => {
  const seasons = toSeasons({
    last_episode_to_air: { season_number: 3, episode_number: 5, air_date: "2026-10-21" },
    next_episode_to_air: { season_number: 3, episode_number: 6, air_date: "2026-10-28" },
    seasons: [
      { season_number: 1, episode_count: 10, air_date: "2024-01-01" },
      { season_number: 2, episode_count: 10, air_date: "2025-01-01" },
      { season_number: 3, episode_count: 12, air_date: "2026-09-16" },
      { season_number: 4, episode_count: 10, air_date: "2027-09-16" },
    ],
  });

  assert.deepEqual(
    seasons.map((s) => s.aired),
    [10, 10, 5, 0],
    "done, done, five in, not started",
  );
});

test("an episode order that outruns the season count is held to it", () => {
  // TMDB sometimes numbers a special or a two-parter past the listed count.
  const [season] = toSeasons({
    last_episode_to_air: { season_number: 1, episode_number: 13 },
    seasons: [{ season_number: 1, episode_count: 10, air_date: "2026-01-01" }],
  });
  assert.equal(season.aired, 10);
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
