import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
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
