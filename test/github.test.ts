import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, test, type TestContext } from "node:test";
import { ConflictError, commitFiles, readRepo } from "../src/lib/github";
import type { RepoConfig } from "../src/lib/github";

/**
 * A stand-in for GitHub's git data API, enforcing the parts that matter:
 * blobs are fetched by sha, and moving the branch fails unless the commit
 * being pushed sits directly on the branch's current tip.
 */
function fakeGitHub() {
  let head = "commit-0";
  const files = new Map<string, string>([
    ["data/shows.json", '{"shows":[]}'],
    ["data/inbox.json", "[]"],
  ]);
  const blobs = new Map<string, string>();
  const trees = new Map<string, Record<string, string>>();
  const commits = new Map<string, { tree: string; parent: string }>();
  let counter = 0;
  const next = (kind: string) => `${kind}-${++counter}`;

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "", "http://x");
      const path = url.pathname.replace("/repos/owner/repo/", "");
      const send = (code: number, value: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(typeof value === "string" ? value : JSON.stringify(value));
      };

      if (req.method === "GET" && path === "git/ref/heads/main") return send(200, { object: { sha: head } });
      if (req.method === "GET" && path.startsWith("git/trees/")) {
        return send(200, {
          tree: [...files.keys()].map((p) => ({ path: p, sha: `blob:${p}`, type: "blob" })),
        });
      }
      if (req.method === "GET" && path.startsWith("git/blobs/")) {
        const sha = decodeURIComponent(path.slice("git/blobs/".length));
        const content = sha.startsWith("blob:") ? files.get(sha.slice(5)) : blobs.get(sha);
        if (content === undefined) return send(404, { message: "no blob" });
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end(content);
      }
      if (req.method === "GET" && path.startsWith("git/commits/")) {
        const sha = path.slice("git/commits/".length);
        return send(200, { tree: { sha: commits.get(sha)?.tree ?? "tree-base" } });
      }
      if (req.method === "POST" && path === "git/blobs") {
        const { content } = JSON.parse(body) as { content: string };
        const sha = next("blob");
        blobs.set(sha, Buffer.from(content, "base64").toString("utf8"));
        return send(201, { sha });
      }
      if (req.method === "POST" && path === "git/trees") {
        const { tree } = JSON.parse(body) as { tree: { path: string; sha: string }[] };
        const sha = next("tree");
        trees.set(sha, Object.fromEntries(tree.map((e) => [e.path, blobs.get(e.sha)!])));
        return send(201, { sha });
      }
      if (req.method === "POST" && path === "git/commits") {
        const { tree, parents } = JSON.parse(body) as { tree: string; parents: string[] };
        const sha = next("commit");
        commits.set(sha, { tree, parent: parents[0] });
        return send(201, { sha });
      }
      if (req.method === "PATCH" && path === "git/refs/heads/main") {
        const { sha } = JSON.parse(body) as { sha: string };
        const commit = commits.get(sha)!;
        // Not a fast-forward: someone else moved the branch first.
        if (commit.parent !== head) return send(422, { message: "not a fast forward" });
        for (const [p, content] of Object.entries(trees.get(commit.tree) ?? {})) files.set(p, content);
        head = sha;
        return send(200, { object: { sha } });
      }
      return send(404, { message: `unhandled ${req.method} ${path}` });
    });
  });

  return {
    server,
    files,
    /** Simulate the other person saving while we were busy. */
    moveBranch(path: string, content: string) {
      files.set(path, content);
      const sha = next("commit");
      commits.set(sha, { tree: "tree-other", parent: head });
      head = sha;
    },
  };
}

async function listen(server: Server, t: TestContext): Promise<number> {
  // Closed via the test context: a failed assertion must not leave the server
  // listening, or the whole run hangs waiting on an open handle.
  t.after(() => new Promise((done) => server.close(() => done(undefined))));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as { port: number }).port;
}

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

/** Point the client's api.github.com calls at the local stand-in. */
function route(port: number) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    realFetch(String(input).replace("https://api.github.com", `http://127.0.0.1:${port}`), init)) as typeof fetch;
}

const config: RepoConfig = { owner: "owner", repo: "repo", branch: "main", token: "t" };

test("reads files by blob, with no size ceiling in the way", async (t) => {
  const gh = fakeGitHub();
  route(await listen(gh.server, t));

  // Comfortably past the megabyte where the contents API gives up.
  const big = JSON.stringify({ shows: Array.from({ length: 20000 }, (_, i) => ({ id: `show-${i}`, title: `Show Number ${i}`, note: "x".repeat(40) })) });
  assert.ok(big.length > 1_048_576);
  gh.files.set("data/shows.json", big);

  const snapshot = await readRepo(config, ["data/shows.json", "data/inbox.json"]);
  assert.equal(snapshot.headSha, "commit-0");
  assert.equal(snapshot.files["data/shows.json"], big);
  assert.equal(snapshot.files["data/inbox.json"], "[]");
});

test("a save lands both files in a single commit", async (t) => {
  const gh = fakeGitHub();
  route(await listen(gh.server, t));

  const snapshot = await readRepo(config, ["data/shows.json", "data/inbox.json"]);
  await commitFiles(
    config,
    snapshot.headSha,
    { "data/shows.json": '{"shows":["new"]}', "data/inbox.json": "[]" },
    "Inbox: added 1",
  );

  assert.equal(gh.files.get("data/shows.json"), '{"shows":["new"]}');
});

test("committing onto a stale head is refused rather than overwriting", async (t) => {
  const gh = fakeGitHub();
  route(await listen(gh.server, t));

  const snapshot = await readRepo(config, ["data/shows.json"]);
  gh.moveBranch("data/shows.json", '{"shows":["theirs"]}'); // the other person saves first

  await assert.rejects(
    () => commitFiles(config, snapshot.headSha, { "data/shows.json": '{"shows":["mine"]}' }, "mine"),
    ConflictError,
  );
  // Their save stands; ours did not silently win.
  assert.equal(gh.files.get("data/shows.json"), '{"shows":["theirs"]}');
});

test("re-reading after a conflict lets the save go through", async (t) => {
  const gh = fakeGitHub();
  route(await listen(gh.server, t));

  const stale = await readRepo(config, ["data/shows.json"]);
  gh.moveBranch("data/shows.json", '{"shows":["theirs"]}');
  await assert.rejects(() => commitFiles(config, stale.headSha, { "data/shows.json": "x" }, "m"), ConflictError);

  const fresh = await readRepo(config, ["data/shows.json"]);
  assert.equal(fresh.files["data/shows.json"], '{"shows":["theirs"]}');
  await commitFiles(config, fresh.headSha, { "data/shows.json": '{"shows":["both"]}' }, "m");
  assert.equal(gh.files.get("data/shows.json"), '{"shows":["both"]}');
});

test("a missing file is reported by name", async (t) => {
  const gh = fakeGitHub();
  route(await listen(gh.server, t));
  await assert.rejects(() => readRepo(config, ["data/nope.json"]), /data\/nope\.json is not in the repo/);
});
