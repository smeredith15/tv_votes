import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fetchVersion } from "../src/lib/version";

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

function serving(handler: () => Response) {
  globalThis.fetch = (() => Promise.resolve(handler())) as unknown as typeof fetch;
}

const payload = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ bundle: "assets/index-ABC123.js", commit: "5a70bed", builtAt: "2026-09-15T00:00:00.000Z", ...extra });

test("the published bundle is read back by name, without its directory", () => {
  serving(() => new Response(payload()));
  return fetchVersion("/tv_votes/").then((info) => {
    assert.equal(info?.bundle, "index-ABC123.js");
    assert.equal(info?.commit, "5a70bed");
  });
});

test("the check is made past the browser cache", async () => {
  let init: RequestInit | undefined;
  globalThis.fetch = ((_url: string, options?: RequestInit) => {
    init = options;
    return Promise.resolve(new Response(payload()));
  }) as unknown as typeof fetch;

  await fetchVersion("/");
  assert.equal(init?.cache, "no-store");
});

test("a new commit over the same app is not a new version", async () => {
  // Every vote saved commits and redeploys. Keyed on the commit, the running
  // app would look out of date the moment anyone saved anything.
  serving(() => new Response(payload({ commit: "deadbee" })));
  const info = await fetchVersion("/");
  assert.equal(info?.bundle, "index-ABC123.js", "the bundle is what decides");
});

test("a missing or unreadable version file says nothing rather than nagging", async () => {
  serving(() => new Response("not found", { status: 404 }));
  assert.equal(await fetchVersion("/"), null);

  serving(() => new Response("<html>", { status: 200 }));
  assert.equal(await fetchVersion("/"), null);

  // No bundle recorded: nothing to compare, so do not claim staleness.
  serving(() => new Response(JSON.stringify({ commit: "abc" })));
  assert.equal(await fetchVersion("/"), null);

  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
  assert.equal(await fetchVersion("/"), null);
});
