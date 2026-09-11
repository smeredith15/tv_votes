import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync } from "node:fs";

// The JSON ledgers are served as static files rather than bundled, so the
// nightly metadata refresh can update them without rebuilding the app.
const copyData = {
  name: "copy-data",
  closeBundle() {
    cpSync("data", "dist/data", { recursive: true });
  },
};

export default defineConfig({
  base: process.env.BASE_PATH ?? "/tv_votes/",
  plugins: [react(), copyData],
  server: { port: 5173 },
});
