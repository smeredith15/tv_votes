import assert from "node:assert/strict";
import { after, test } from "node:test";
import { RUNNING_VERSION, publishedVersion } from "../src/lib/version";

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

function serving(handler: () => Response | Promise<Response>) {
  globalThis.fetch = (() => Promise.resolve(handler())) as unknown as typeof fetch;
}

test("the published version is read back", async () => {
  serving(() => new Response(JSON.stringify({ version: "abc1234", builtAt: "x" })));
  assert.equal(await publishedVersion("/tv_votes/"), "abc1234");
});

test("the check is made past the browser cache", async () => {
  // The whole point is catching a deploy the cached HTML is hiding, so a
  // cached answer would defeat it.
  let init: RequestInit | undefined;
  globalThis.fetch = ((_url: string, options?: RequestInit) => {
    init = options;
    return Promise.resolve(new Response(JSON.stringify({ version: "abc" })));
  }) as unknown as typeof fetch;

  await publishedVersion("/");
  assert.equal(init?.cache, "no-store");
});

test("a missing or unreadable version file says nothing rather than nagging", async () => {
  serving(() => new Response("not found", { status: 404 }));
  assert.equal(await publishedVersion("/"), null);

  serving(() => new Response("<html>", { status: 200 }));
  assert.equal(await publishedVersion("/"), null);

  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
  assert.equal(await publishedVersion("/"), null);
});

test("a build with no version stamped in does not claim to be stale", async () => {
  serving(() => new Response(JSON.stringify({ builtAt: "x" })));
  assert.equal(await publishedVersion("/"), null);
});

test("the running build reports the version it was stamped with", () => {
  assert.equal(RUNNING_VERSION, "testbuild");
});
