import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ViteDevServer } from "vite";

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
  plugins: [react(), copyData],
  server: { port: 5173 },
});
