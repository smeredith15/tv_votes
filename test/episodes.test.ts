import assert from "node:assert/strict";
import { test } from "node:test";
import {
  episodesFromSeasons,
  formatPosition,
  pace,
  perSitting,
  positionAfter,
  seasonsCovered,
  totalEpisodes,
} from "../src/lib/episodes";
import { makeShow } from "./helpers";

/** The Wire as it stands: five seasons, the first two already watched. */
const wire = makeShow({
  id: "wire",
  title: "The Wire",
  runtime: 60,
  seasons: [
    { number: 1, episodes: 13, watched: true },
    { number: 2, episodes: 12, watched: true },
    { number: 3, episodes: 12, watched: false },
    { number: 4, episodes: 13, watched: false },
    { number: 5, episodes: 10, watched: false },
  ],
});

test("a run is counted end to end", () => {
  assert.equal(totalEpisodes(wire), 60);
  assert.equal(episodesFromSeasons(wire), 25);
});

test("a flat count converts back to a season and episode", () => {
  assert.deepEqual(positionAfter(wire.seasons, 0), { season: 1, episode: 1 });
  assert.deepEqual(positionAfter(wire.seasons, 12), { season: 1, episode: 13 });
  assert.deepEqual(positionAfter(wire.seasons, 13), { season: 2, episode: 1 });
  assert.deepEqual(positionAfter(wire.seasons, 25), { season: 3, episode: 1 });
  assert.deepEqual(positionAfter(wire.seasons, 28), { season: 3, episode: 4 });
  assert.equal(positionAfter(wire.seasons, 60), null, "past the last episode");
});

test("positions read the way people write them", () => {
  assert.equal(formatPosition({ season: 3, episode: 4 }), "S03E04");
  assert.equal(formatPosition({ season: 12, episode: 22 }), "S12E22");
  assert.equal(formatPosition(null), "the end");
});

test("the cursor and the season ticks agree", () => {
  assert.deepEqual(seasonsCovered(wire.seasons, 0), []);
  assert.deepEqual(seasonsCovered(wire.seasons, 13), [1]);
  assert.deepEqual(seasonsCovered(wire.seasons, 25), [1, 2]);
  assert.deepEqual(seasonsCovered(wire.seasons, 30), [1, 2], "part way through the third");
  assert.deepEqual(seasonsCovered(wire.seasons, 60), [1, 2, 3, 4, 5]);
});

test("a sitting is two half-hours or one hour", () => {
  assert.equal(perSitting(wire), 1);
  assert.equal(perSitting(makeShow({ id: "a", runtime: 30 })), 2);
  assert.equal(perSitting(makeShow({ id: "b", runtime: null })), 1);
});

test("where The Wire should be, having started on the 11th", () => {
  // Started 11 September from the top of season three; by 5 October that is
  // the fourth Friday, so four episodes in.
  const now = pace(
    wire,
    { startedOn: "2026-09-11", startEpisode: 25, longWeekends: 0, watched: 25 },
    new Date(2026, 9, 5),
  );
  assert.equal(now?.sittings, 4);
  assert.equal(now?.target, 29);
  assert.equal(formatPosition(positionAfter(wire.seasons, now!.target)), "S03E05");
  assert.equal(now?.episodesAhead, -4, "four behind");
});

test("the first night counts as a sitting, not a week later", () => {
  const first = pace(
    wire,
    { startedOn: "2026-09-11", startEpisode: 25, longWeekends: 0, watched: 25 },
    new Date(2026, 8, 11),
  );
  assert.equal(first?.sittings, 1);
  assert.equal(first?.target, 26);
});

test("a long weekend doubles that week's allotment", () => {
  const options = { startedOn: "2026-09-11", startEpisode: 25, longWeekends: 0, watched: 25 };
  const plain = pace(wire, options, new Date(2026, 9, 5));
  const withOne = pace(wire, { ...options, longWeekends: 1 }, new Date(2026, 9, 5));
  const withTwo = pace(wire, { ...options, longWeekends: 2 }, new Date(2026, 9, 5));

  assert.equal(withOne!.target - plain!.target, 1, "one hour-long show is one more episode");
  assert.equal(withTwo!.target - plain!.target, 2);

  // A half-hour show gets two a week, so a long weekend is worth two more.
  const half = makeShow({ id: "h", runtime: 30, seasons: [{ number: 1, episodes: 40, watched: false }] });
  const before = pace(half, { startedOn: "2026-09-11", startEpisode: 0, longWeekends: 0, watched: 0 }, new Date(2026, 9, 5));
  const after = pace(half, { startedOn: "2026-09-11", startEpisode: 0, longWeekends: 1, watched: 0 }, new Date(2026, 9, 5));
  assert.equal(after!.target - before!.target, 2);
});

test("being ahead is reported as plainly as being behind", () => {
  const ahead = pace(
    wire,
    { startedOn: "2026-09-11", startEpisode: 25, longWeekends: 0, watched: 33 },
    new Date(2026, 9, 5),
  );
  assert.equal(ahead?.episodesAhead, 4);
});

test("the schedule never asks for more episodes than there are", () => {
  const far = pace(
    wire,
    { startedOn: "2020-01-01", startEpisode: 25, longWeekends: 0, watched: 25 },
    new Date(2026, 9, 5),
  );
  assert.equal(far?.target, 60, "capped at the last episode");
});

test("a start date in the future is not yet a sitting, and a bad one says nothing", () => {
  const soon = pace(
    wire,
    { startedOn: "2026-12-25", startEpisode: 25, longWeekends: 0, watched: 25 },
    new Date(2026, 9, 5),
  );
  assert.equal(soon?.sittings, 0);
  assert.equal(soon?.target, 25);
  assert.equal(pace(wire, { startedOn: "not a date", startEpisode: 0, longWeekends: 0, watched: 0 }), null);
});
