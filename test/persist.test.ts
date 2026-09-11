import assert from "node:assert/strict";
import { test } from "node:test";
import { loadList, loadRecord, save, type Storage } from "../src/lib/persist";

function memoryStore(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

test("an empty stored list reads back as an empty list, not an object", () => {
  // This is the bug that blanked the page: spreading [] into an object literal
  // gives {}, which has no .reduce, so the first reload after a visit crashed.
  const store = memoryStore({ pending: "[]" });
  const list = loadList(store, "pending");
  assert.ok(Array.isArray(list), "must still be an array");
  assert.equal(list.length, 0);
  assert.equal(typeof list.reduce, "function");
});

test("a stored list round-trips through save", () => {
  const store = memoryStore();
  save(store, "pending", [{ type: "vote" }, { type: "season" }]);
  const list = loadList<{ type: string }>(store, "pending");
  assert.ok(Array.isArray(list));
  assert.deepEqual(list.map((o) => o.type), ["vote", "season"]);
});

test("a missing or unusable list reads as empty", () => {
  assert.deepEqual(loadList(memoryStore(), "nothing"), []);
  assert.deepEqual(loadList(memoryStore({ pending: "not json" }), "pending"), []);
  assert.deepEqual(loadList(memoryStore({ pending: '{"0":"op"}' }), "pending"), []);
  assert.deepEqual(loadList(memoryStore({ pending: "null" }), "pending"), []);
});

test("a stored record keeps defaults for anything it lacks", () => {
  const store = memoryStore({ settings: JSON.stringify({ region: "GB" }) });
  assert.deepEqual(loadRecord(store, "settings", { voter: "both", region: "US" }), {
    voter: "both",
    region: "GB",
  });
});

test("settings saved by an older version still load", () => {
  // The release before this one stored me/sealed instead of voter.
  const store = memoryStore({ settings: JSON.stringify({ me: "scotty", sealed: false, region: "US" }) });
  const settings = loadRecord(store, "settings", { voter: "both", region: "US" });
  assert.equal(settings.voter, "both");
});

test("a record that is not an object falls back whole", () => {
  const fallback = { voter: "both" };
  assert.deepEqual(loadRecord(memoryStore({ settings: "[]" }), "settings", fallback), fallback);
  assert.deepEqual(loadRecord(memoryStore({ settings: "7" }), "settings", fallback), fallback);
  assert.deepEqual(loadRecord(memoryStore({ settings: "bad" }), "settings", fallback), fallback);
});

test("storage that throws does not take the app down", () => {
  const broken: Storage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => {},
  };
  assert.deepEqual(loadList(broken, "pending"), []);
  assert.deepEqual(loadRecord(broken, "settings", { voter: "both" }), { voter: "both" });
  assert.doesNotThrow(() => save(broken, "pending", []));
});
