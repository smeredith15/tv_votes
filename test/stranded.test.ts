import assert from "node:assert/strict";
import { test } from "node:test";
import { strandedReason } from "../src/lib/ledgers";
import { makeShow, seasons } from "./helpers";

test("being caught up says so", () => {
  const show = makeShow({ id: "mr-robot", runtime: 60, seasons: seasons(4, 4) });
  assert.equal(strandedReason(show, "hour"), "caught up — nothing left to watch");
});

test("an hour-long show carrying half-hour votes says that, not that it is watched", () => {
  // Ponies, Riot Women and Why Women Kill are all in this position: they came
  // off the workbook's 30 sheet, and TMDB puts them at an hour.
  const show = makeShow({ id: "ponies", runtime: 60, seasons: seasons(1, 0) });
  assert.equal(strandedReason(show, "half"), "a 60-minute show, so not a half-hour one");
});

test("a half-hour show on the hour ballot, and a length nobody recorded", () => {
  assert.equal(
    strandedReason(makeShow({ id: "a", runtime: 30, seasons: seasons(2, 0) }), "hour"),
    "a 30-minute show, so not an hour-long one",
  );
  assert.equal(
    strandedReason(makeShow({ id: "b", runtime: null, seasons: seasons(2, 0) }), "half"),
    "a show of unrecorded length, so not a half-hour one",
  );
});

test("a universe member is named by its universe", () => {
  const show = makeShow({ id: "daredevil", universe: "mcu", runtime: 60, seasons: seasons(3, 0) });
  assert.equal(strandedReason(show, "hour", "MCU"), "watched inside MCU");
  assert.equal(strandedReason(show, "hour"), "watched inside a universe");
});

test("the reason matches the rule that actually excluded it", () => {
  // Caught up and in a universe at once: the universe is checked first, so
  // that is what it says.
  const both = makeShow({ id: "x", universe: "mcu", runtime: 60, seasons: seasons(2, 2) });
  assert.equal(strandedReason(both, "hour", "MCU"), "watched inside MCU");

  // Caught up and auto-resume: caught up is the earlier rule.
  const auto = makeShow({ id: "y", runtime: 60, autoResume: true, seasons: seasons(2, 2) });
  assert.equal(strandedReason(auto, "hour"), "caught up — nothing left to watch");

  const waiting = makeShow({ id: "z", runtime: 60, autoResume: true, seasons: seasons(3, 2) });
  assert.equal(strandedReason(waiting, "hour"), "set to start new seasons on its own");
});

test("a series on the mini ballot is told what it is", () => {
  const show = makeShow({ id: "s", runtime: 60, format: "series", seasons: seasons(3, 0) });
  assert.equal(strandedReason(show, "mini"), "a series, not a mini or anthology");
});

test("a show kept off a ballot on purpose says so", () => {
  const show = makeShow({ id: "k", runtime: 30, exclude: ["half"], seasons: seasons(2, 0) });
  assert.equal(strandedReason(show, "half"), "kept off this ballot by hand");
});
