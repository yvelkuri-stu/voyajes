import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// GitHub Pages project site: https://yvelkuri-stu.github.io/voyajes/
// Set GITHUB_PAGES=1 in CI; local `pnpm dev` stays at /.
const base =
  process.env.VITE_BASE_PATH ||
  (process.env.GITHUB_PAGES === "1" ? "/voyajes/" : "/");

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: {
      "@voyajes/core": resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
  publicDir: "public",
});
