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
  packages/cli/      `voyajes` CLI (init, sync, catalog, ffmpeg render, doctor)
  catalog/           Official manifest (themes + audio beats)
```

**Screens:** Home · Create/Compose (import + slideshow preview) · Theme picker (Neon Night, Soft Film, Ocean Pop, Golden Hour) · Share page stub.

### Create / Import / Preview (working in web)

- Drag-drop or file picker for **images** (JPG/PNG/WebP/…) and **video** (MP4/WebM/MOV)
- Object-URL preview in the phone-frame stage with theme **grade overlay**, Ken Burns, and timed transitions (dissolve / push / whip / light-leak)
- Filmstrip: select, **reorder** (↑↓), **remove**, hold-duration edit
- **Play / Pause** auto-advances clips; timing uses theme `transitionDurationMs` + per-clip duration
- Draft persists as Voyajes project JSON in `localStorage` (`voyajes.project.draft.json`) matching `@voyajes/core` schema; media blobs in IndexedDB
- **Export JSON** downloads `voyajes.project.json` for the CLI (`voyajes render`)
- **Export video** (browser): canvas + MediaRecorder records the Create slideshow to **WebM** (VP9/VP8 + Opus when supported; MP4 only if the browser allows). Includes theme grade/vignette, Ken Burns on stills, best-effort transitions, on-video title, and **selected beat audio** muxed via Web Audio (`decodeAudioData` → `MediaStreamAudioDestinationNode`) when a catalog `previewUrl` exists. Progress + cancel on the Compose toolbar. Named from the project title.
- **Audio panel:** catalog beats (Warm Acoustic, Neon Pulse, Ocean Drift) with ▶ preview (MP3 stubs under `public/catalog/previews/`, WebAudio BPM metronome fallback), **license badges** (personal / creator), **beat-sync** (off/soft/medium/hard snaps image holds to beat/bar grid), **ducking** toggle (mild export gain trim; true dialogue duck still metadata)

**Browser export limits (honest):** runs in near real-time (length ≈ slideshow duration); beat audio mux is best-effort — if decode/`MediaRecorder` rejects audio, export continues **video-only** with a soft status warning; metronome preview is **not** recorded (file preview only); clip camera audio is never captured; Safari often lacks WebM+Opus (may fall back to video-only or unsupported); Firefox/Chrome differ on `vp8/vp9,opus`; Autoplay/AudioContext usually fine after the Export click gesture. Transitions/Ken Burns approximate the CSS preview. **CLI local encode** via `voyajes render` (ffmpeg) is available when ffmpeg is installed — best-effort grades/xfade/title/beat mux, not a pixel-perfect match of the canvas exporter. Also not done: OAuth, cloud billing, HLS playback, true dialogue ducking, Remotion. Preview MP3s are short demo tone loops, not commercial stems.

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

Requires **ffmpeg** on PATH for `voyajes render` (web export uses the browser; CLI uses ffmpeg).

```bash
# macOS / Ubuntu
brew install ffmpeg   # or: sudo apt install ffmpeg
which ffmpeg
```

```bash
cd /workspace/voyajes
pnpm build:core && pnpm build:cli

# help
pnpm voyajes --help
# or
node packages/cli/dist/index.js --help

# catalog
pnpm voyajes catalog list --kind theme
pnpm voyajes catalog list --kind audio-beat
pnpm voyajes sync

# init a project folder (creates media/ + voyajes.project.json;
# generates 3 sample PNGs with ffmpeg when media/ is empty)
pnpm voyajes init ./my-voyage \
  --theme theme.ocean-pop \
  --title "Goa 2026" \
  --beat-sync medium \
  --beat audio.warm-acoustic-092

# drop your own photos into ./my-voyage/media/ and re-run init to refresh paths

# validate schema + media paths + ffmpeg
pnpm voyajes doctor ./my-voyage/voyajes.project.json

# render → WebM (VP9 + Opus beat audio) — matches web export concepts
pnpm voyajes render ./my-voyage/voyajes.project.json -o ./my-voyage/out.webm

# or MP4 (H.264 + AAC), with overrides aligned to the Create UI
pnpm voyajes render ./my-voyage/voyajes.project.json -o ./my-voyage/out.mp4 \
  --theme theme.neon-night \
  --beat-sync hard \
  --title "Neon voyage" \
  --quality 1080p \
  --json
```

**CLI ↔ web parity**

| Concept | Web Create | CLI |
| --- | --- | --- |
| Theme grades + transitions | CSS / canvas | ffmpeg `eq`/`colorbalance` + `xfade` |
| Beat-sync holds | soft/medium/hard snap | `--beat-sync` + project `audio.beatSync` |
| On-video title | canvas draw | `--title` / `drawtext` |
| Beat audio mux | MediaRecorder + AudioContext | catalog `previews/*.mp3` via ffmpeg |
| Output | browser WebM download | `-o out.webm` or `-o out.mp4` |

If ffmpeg is missing, `render` still **Zod-validates** the project, prints install hints, and exits `2`.

Binary name: **`voyajes`** (same as the product).

## Project schema (sketch)

```json
{
  "schema": 1,
  "title": "Goa 2026",
  "aspect": "9:16",
  "theme": "theme.ocean-pop@1.0.0",
  "media": [{ "path": "./img/01.jpg", "mute": true }],
  "audio": { "track": "audio.warm-acoustic-092@1.0.0", "beatSync": "medium", "ducking": true },
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

1. ~~Media import + local preview~~ (done in Create)  
2. ~~Browser WebM export (canvas + MediaRecorder)~~ (best-effort slideshow)  
3. ~~CLI local ffmpeg render~~ (`voyajes render` → WebM/MP4 + beat audio)  
4. Catalog CDN sync + signed audio stems  
5. Social OAuth + public share HLS/OG  
6. Cloud / Remotion encode queue (optional) + Spark/Pro billing  

## License

Private / unpublished — all rights reserved by the Voyajes family project.


## GitHub Pages

**Live:** https://yvelkuri-stu.github.io/voyajes/

Currently served from the **`gh-pages`** branch (built with `GITHUB_PAGES=1` → Vite `base: /voyajes/`). SPA routes use a copied `404.html`. Router basename and catalog `/catalog/...` assets resolve under that base.

### Optional: switch to GitHub Actions

Workflow file is ready at `.github/workflows/deploy-pages.yml` (local). Pushing it needs the **`workflow`** OAuth scope:

```bash
gh auth refresh -h github.com -s workflow
git add .github/workflows/deploy-pages.yml
git commit -m "ci: add GitHub Pages Actions deploy"
git push
```

Then set Pages source to **GitHub Actions** (Settings → Pages), or:

```bash
gh api -X PUT repos/yvelkuri-stu/voyajes/pages -f build_type=workflow
```

### Manual redeploy (current)

```bash
GITHUB_PAGES=1 pnpm --filter @voyajes/core build
GITHUB_PAGES=1 pnpm --filter @voyajes/web build
cp apps/web/dist/index.html apps/web/dist/404.html
# publish apps/web/dist to origin/gh-pages
```
