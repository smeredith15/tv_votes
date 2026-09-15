import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";

/** Which build this is: the commit in CI, the working tree locally. */
function buildVersion(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

const VERSION = buildVersion();
const BUILT_AT = new Date().toISOString();

/**
 * What the published app is, fetchable without going through the cache.
 *
 * Pages serves index.html with ten minutes of caching, so a browser can sit on
 * the old app long after a deploy — which looks exactly like the deploy having
 * failed. The running app compares itself against this and offers a reload.
 *
 * The name of the bundle, not the commit: every vote saved from the app is a
 * commit of its own, and each one redeploys. Keyed on the commit, the running
 * app looked out of date the moment anyone saved anything, while being byte
 * for byte the same. Vite already content-hashes the bundle, so its name
 * changes exactly when the app does.
 */
const stampVersion: Plugin = {
  name: "stamp-version",
  generateBundle(_options, bundle) {
    const entry = Object.values(bundle).find((file) => file.type === "chunk" && file.isEntry);
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: `${JSON.stringify({ bundle: entry?.fileName ?? "", commit: VERSION, builtAt: BUILT_AT })}\n`,
    });
  },
};

/**
 * The JSON ledgers ship as static files rather than bundled, so the nightly
 * metadata refresh can update them without rebuilding the app.
 *
 * Only do that when the site itself is private (GitHub Pages on a private
 * repo). A site hosted somewhere public must not carry the ledgers with it —
 * there the app reads and writes the private repo through the GitHub API, and
 * the deployed files are nothing but code.
 */
const copyData = {
  name: "copy-data",
  closeBundle() {
    if (process.env.PUBLISH_DATA === "1") cpSync("data", "dist/data", { recursive: true });
  },
  // In dev, serve them off disk so the app works before any token is pasted in.
  configureServer(server: ViteDevServer) {
    server.middlewares.use("/data", (req, res, next) => {
      const file = resolve("data", (req.url ?? "").replace(/^\/+/, "").split("?")[0]);
      if (!file.startsWith(resolve("data")) || !existsSync(file)) return next();
      res.setHeader("Content-Type", "application/json");
      res.end(readFileSync(file));
    });
  },
};

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), copyData, stampVersion],
  server: { port: 5173 },
});
