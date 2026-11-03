import assert from "node:assert/strict";
import { test } from "node:test";
import {
  airedEpisodes,
  airedIn,
  airsNext,
  fullyAired,
  nextAiring,
  titleAt,
} from "../src/lib/episodes";
import { fetchGuide, seasonsToFetch } from "../src/lib/guide";
import { applyOps, compact, type Op } from "../src/lib/ops";
import type { EpisodeGuide } from "../src/lib/types";
import { makeData, makeShow } from "./helpers";

const TODAY = "2026-11-03";

/** Abbott as it stands: five done, a sixth going out weekly. */
const abbott = makeShow({
  id: "abbott",
  title: "Abbott Elementary",
  runtime: 30,
  status: "returning",
  tmdbId: 124251,
  seasons: [
    { number: 5, episodes: 22, watched: true },
    { number: 6, episodes: 22, watched: false },
  ],
});

const guide: EpisodeGuide = {
  updatedAt: "2026-11-03T07:00:00Z",
  shows: {
    abbott: {
      5: Array.from({ length: 22 }, (_, i) => ({ n: i + 1, title: `Five ${i + 1}`, airDate: "2025-10-01" })),
      6: [
        { n: 1, title: "Volunteer Week", airDate: "2026-10-14" },
        { n: 2, title: "Fundraiser", airDate: "2026-10-21" },
        { n: 3, title: "Field Trip", airDate: "2026-10-28" },
        { n: 4, title: null, airDate: "2026-11-11" },
        { n: 5, title: null, airDate: null },
      ],
    },
  },
};

test("only the episodes already out count as aired", () => {
  assert.equal(airedIn(abbott, abbott.seasons[1], guide, TODAY), 3, "three of season six so far");
  assert.equal(airedEpisodes(abbott, guide, TODAY), 25);
  // An episode dated today has gone out; tomorrow's has not.
  assert.equal(airedIn(abbott, abbott.seasons[1], guide, "2026-10-28"), 3);
  assert.equal(airedIn(abbott, abbott.seasons[1], guide, "2026-10-27"), 2);
});

test("a season still going out cannot be ticked off whole", () => {
  assert.equal(fullyAired(abbott, abbott.seasons[0], guide, TODAY), true);
  assert.equal(fullyAired(abbott, abbott.seasons[1], guide, TODAY), false);
});

test("without a guide the refresh's count stands, and without that, the season", () => {
  const counted = makeShow({ id: "x", seasons: [{ number: 1, episodes: 10, aired: 4, watched: false }] });
  assert.equal(airedEpisodes(counted, undefined, TODAY), 4);

  const older = makeShow({ id: "y", seasons: [{ number: 1, episodes: 10, watched: false }] });
  assert.equal(airedEpisodes(older, undefined, TODAY), 10);
});

test("the guide names the episode you are on, where TMDB has a name", () => {
  assert.equal(titleAt(guide, "abbott", { season: 6, episode: 1 }), "Volunteer Week");
  assert.equal(titleAt(guide, "abbott", { season: 6, episode: 4 }), null, "numbered, not named");
  assert.equal(titleAt(guide, "abbott", null), null);
  assert.equal(titleAt(guide, "someone-else", { season: 1, episode: 1 }), null);
});

test("what comes next is read off the dates, not the show's stale field", () => {
  const next = nextAiring(abbott, guide, TODAY);
  assert.deepEqual(next?.position, { season: 6, episode: 4 });
  assert.equal(next?.airDate, "2026-11-11");
  assert.equal(airsNext(abbott, guide, TODAY), "next Nov 11");

  // No guide, but the refresh left a count and a date: those answer instead.
  const counted = makeShow({
    id: "abbott",
    nextAirDate: "2026-11-11",
    seasons: [{ number: 6, episodes: 22, aired: 3, watched: false }],
  });
  assert.equal(airsNext(counted, { updatedAt: null, shows: {} }, TODAY), "next Nov 11");
});

test("seasons already held and long finished are not asked for again", () => {
  // Season 5 is settled; season 6 is mid-flight and short of its full count.
  assert.deepEqual(seasonsToFetch(abbott, guide, { stamp: TODAY }), [6]);
  // From where you are watching, so finished seasons behind you are skipped.
  assert.deepEqual(seasonsToFetch(abbott, undefined, { from: 6, stamp: TODAY }), [6]);
  assert.deepEqual(seasonsToFetch(abbott, undefined, { stamp: TODAY }), [5, 6]);
});

test("a fetch becomes ops, and one bad season does not sink the rest", async () => {
  const tmdb = {
    season: async (_id: number, number: number) => {
      if (number === 5) throw new Error("404");
      return { episodes: [{ episode_number: 1, name: "Volunteer Week", air_date: "2026-10-14" }] };
    },
  };
  const toGuide = (season: unknown) =>
    ((season as { episodes: { episode_number: number; name: string; air_date: string }[] }).episodes ?? []).map(
      (e) => ({ n: e.episode_number, title: e.name, airDate: e.air_date }),
    );

  const ops = await fetchGuide(tmdb, abbott, [5, 6], toGuide, "2026-11-03T12:00:00Z");
  assert.equal(ops.length, 1, "season five is dropped, season six survives");

  const data = makeData([abbott]);
  applyOps(data, ops);
  assert.equal(data.guide.shows.abbott[6][0].title, "Volunteer Week");
  assert.equal(data.guide.updatedAt, "2026-11-03T12:00:00Z");
});

test("fetching the same season twice sends it once", () => {
  const episodes = [{ n: 1, title: "a", airDate: "2026-10-14" }];
  const ops: Op[] = [
    { type: "guide", showId: "abbott", season: 6, at: "1", episodes },
    { type: "guide", showId: "abbott", season: 6, at: "2", episodes },
    { type: "guide", showId: "abbott", season: 5, at: "2", episodes },
  ];
  assert.equal(compact(ops).length, 2);
});

test("a fetch that fails outright says why, rather than reading as empty", async () => {
  const tmdb = {
    season: async () => {
      throw new Error("TMDB 401: invalid api key");
    },
  };
  await assert.rejects(
    () => fetchGuide(tmdb, abbott, [6], () => [], "2026-11-03T12:00:00Z"),
    /invalid api key/,
  );
});
