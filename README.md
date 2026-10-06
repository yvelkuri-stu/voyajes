# Voyajes

**Every voyage, in motion.**

Family-letter brand (Ye · Va · Ja · Sr · Ve). Color & motion-first templated video for humans and robots — theme before timeline, beautiful share links, CLI parity.

## Tagline options

| # | Line | Notes |
| --- | --- | --- |
| **1 (chosen)** | **Every voyage, in motion** | Journey + motion; used in UI chrome & CLI `--help` |
| 2 | Color your journey | Palette-first; great for marketing |
| 3 | Photos to films, with feeling | Emotional / memory-reel |

UI and `@voyajes/core` `brand.tagline` use **#1**. Swap in `packages/core/src/tokens.ts` if you prefer another.

## What’s in this MVP

```text
voyajes/
  apps/web/          Vite + React + TypeScript UI shell
  packages/core/     Zod project schema, theme types, design tokens
  packages/cli/      `voyajes` CLI (init, sync, catalog, render stub, doctor)
  catalog/           Official manifest (themes + audio beats)
```

**Screens:** Home · Create/Compose (theme panel + preview placeholder) · Theme picker (Neon Night, Soft Film, Ocean Pop, Golden Hour) · Share page stub.

**Not implemented (intentional stubs):** real video encoding / FFmpeg / Remotion, OAuth, cloud billing, HLS playback. `voyajes render` validates the project and prints a clear TODO.

## Design docs (parent workspace)

- `/workspace/media-app-design.md` — UX & tokens (originally “Chroma”; product is now **Voyajes**)
- `/workspace/media-app-nextgen-brief.md` — research & product brief
- `/workspace/media-app-sync-pricing.md` — catalog sync, R2, Free→Studio pricing

## Prerequisites

- Node 18+
- [pnpm](https://pnpm.io) 9+ (repo uses `pnpm@10`)

## Install

```bash
cd /workspace/voyajes
pnpm install
pnpm build:core   # compile @voyajes/core for the CLI
pnpm build:cli
```

## Run the web app

```bash
cd /workspace/voyajes
pnpm dev
```

Open **http://localhost:5173** — Home, Create, Themes, Share (`/v/demo`).

## Run the CLI

```bash
cd /workspace/voyajes
pnpm build:core && pnpm build:cli

# help
pnpm voyajes --help
# or
node packages/cli/dist/index.js --help

# catalog
pnpm voyajes catalog list --kind theme
pnpm voyajes sync

# init a project
pnpm voyajes init ./some-folder --theme theme.ocean-pop -o voyajes.project.json

# validate
pnpm voyajes doctor voyajes.project.json

# render STUB (no encoding)
pnpm voyajes render voyajes.project.json --json
```

Binary name: **`voyajes`** (same as the product).

## Project schema (sketch)

```json
{
  "schema": 1,
  "title": "Goa 2026",
  "aspect": "9:16",
  "theme": "theme.ocean-pop@1.0.0",
  "media": [{ "path": "./img/01.jpg", "mute": true }],
  "audio": { "beatSync": "medium", "ducking": true },
  "share": { "title": "Goa 2026", "public": true }
}
```

Validated by Zod in `@voyajes/core` (`VoyajesProjectSchema`).

## Themes (catalog)

| Name | Id | Mood |
| --- | --- | --- |
| Neon Night | `theme.neon-night` | Magenta, snappy, whip |
| Soft Film | `theme.soft-film` | Warm gold, float, dissolve |
| Ocean Pop | `theme.ocean-pop` | Mint/indigo, soft push |
| Golden Hour | `theme.golden-hour` | Coral sun, light-leak |

Source: `catalog/manifest.json` (copied to `apps/web/public/catalog-manifest.json` for the UI).

## Scripts

| Script | What |
| --- | --- |
| `pnpm install` | Install workspace deps |
| `pnpm dev` | Vite web app |
| `pnpm build` | Build all packages |
| `pnpm build:core` | Compile core |
| `pnpm build:cli` | Compile CLI |
| `pnpm voyajes …` | Run CLI via workspace |

## Roadmap (next)

1. Media import + proxy thumbs  
2. Real local/cloud render (FFmpeg or Remotion) — **not claimed done**  
3. Catalog CDN sync + signed audio stems  
4. Social OAuth + public share HLS/OG  
5. Spark/Pro billing per sync-pricing doc  

## License

Private / unpublished — all rights reserved by the Voyajes family project.
