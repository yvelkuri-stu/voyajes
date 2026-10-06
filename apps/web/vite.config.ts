import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

// GitHub Pages project site: https://yvelkuri-stu.github.io/voyajes/
// Set GITHUB_PAGES=1 in CI; local `pnpm dev` stays at /.
const base =
  process.env.VITE_BASE_PATH ||
  (process.env.GITHUB_PAGES === "1" ? "/voyajes/" : "/");

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
        "robots.txt",
      ],
      manifest: {
        name: "Voyajes",
        short_name: "Voyajes",
        description:
          "Color & motion-first templated video. Photos to films, with feeling.",
        theme_color: "#0B0D12",
        background_color: "#0B0D12",
        display: "standalone",
        orientation: "portrait-primary",
        // Relative to Vite `base` so GitHub Pages /voyajes/ works.
        start_url: "./",
        scope: "./",
        lang: "en",
        categories: ["photo", "video", "lifestyle"],
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache app shell; skip large catalog audio/json from SW runtime cache flood.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
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
