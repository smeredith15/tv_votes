import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";

/**
 * Run the real service worker in a stubbed environment and see which requests
 * it takes responsibility for. The rules matter: answering a save to GitHub out
 * of a cache, or holding on to the staleness check, would each undo a fix that
 * cost a round trip to find.
 */
function loadWorker(origin = "https://smeredith15.github.io") {
  const listeners = {};
  const context = createContext({
    self: {
      location: new URL(`${origin}/tv_votes/sw.js`),
      addEventListener: (type, handler) => {
        listeners[type] = handler;
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: { open: async () => ({ keys: async () => [], put: async () => {}, delete: async () => {} }), keys: async () => [], match: async () => undefined, delete: async () => {} },
    fetch: async () => new Response("", { status: 200 }),
    Response,
    URL,
    console,
  });
  context.self.caches = context.caches;
  runInContext(readFileSync("public/sw.js", "utf8"), context);
  return listeners;
}

/** Ask the worker what it would do with one request. */
function handles(listeners, url, method = "GET") {
  let claimed = false;
  listeners.fetch({
    request: { url, method },
    respondWith: () => {
      claimed = true;
    },
  });
  return claimed;
}

const APP = "https://smeredith15.github.io/tv_votes";

test("the worker answers for the app's own pages and files", () => {
  const sw = loadWorker();
  assert.equal(handles(sw, `${APP}/`), true);
  assert.equal(handles(sw, `${APP}/assets/index-ABC123.js`), true);
  assert.equal(handles(sw, `${APP}/data/shows.json`), true);
  assert.equal(handles(sw, `${APP}/icons/icon-192.png`), true);
});

test("saving a vote is never answered from a cache", () => {
  // Anything off this origin — GitHub, TMDB, posters — goes straight out.
  const sw = loadWorker();
  assert.equal(handles(sw, "https://api.github.com/repos/smeredith15/tv_votes/git/ref/heads/main"), false);
  assert.equal(handles(sw, "https://api.themoviedb.org/3/tv/1396"), false);
  assert.equal(handles(sw, "https://image.tmdb.org/t/p/w185/poster.jpg"), false);
});

test("the staleness check is left to reach the network", () => {
  // Cached, it could only ever report the version it was cached with.
  const sw = loadWorker();
  assert.equal(handles(sw, `${APP}/version.json`), false);
});

test("only reads are handled, so a write is never intercepted", () => {
  const sw = loadWorker();
  assert.equal(handles(sw, `${APP}/data/shows.json`, "POST"), false);
  assert.equal(handles(sw, `${APP}/data/shows.json`, "PUT"), false);
});
