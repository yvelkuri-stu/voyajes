# Voyajes

**Every voyage, in motion.**

Yes, it’s spelled **Voyajes** on purpose. Not a typo. Not autocorrect losing a fight with “voyages.” We kept the *j* because it looks like a passport stamp and sounds like you’re already halfway out the door. Say it like *voy-AH-hess* (or yell it at your render queue — both work).

Drop in a messy camera roll. Pick a color & motion theme. Hit play. Walk away with a short film that feels like you meant it — in the browser, or from the CLI your robots already love.

> Theme before timeline. Beauty before spreadsheet energy.

**Live demo:** https://yvelkuri-stu.github.io/voyajes/  
**Repo:** https://github.com/yvelkuri-stu/voyajes

---

## Taglines (pick your mood)

| # | Line | Vibes |
| --- | --- | --- |
| **1 (in the UI)** | **Every voyage, in motion** | Journey + kinetic |
| 2 | Color your journey | Palette-first marketing |
| 3 | Photos to films, with feeling | Soft memory-reel |

Swap in `packages/core/src/tokens.ts` if #2 or #3 steals your heart.

---

## What’s in the box

```text
voyajes/
  apps/web/          Vite + React + TypeScript UI
  packages/core/     Zod project schema, themes, design tokens
  packages/cli/      `voyajes` CLI (init, sync, catalog, ffmpeg render, doctor)
  catalog/           Official themes + audio beats
  SETUP_AUTH.md      Google / Apple / Microsoft / Meta / GitHub OAuth setup
```

**Screens:** Home · Create/Compose · Themes (10 looks: Neon Night, Soft Film, Ocean Pop, Golden Hour, Retro VHS, Minimal White, Cyber Lime, Rose Quartz, Documentary Grain, Party Strobe) · Share · Sign-in (OAuth shell)

### Create / import / preview / export

- Drag-drop **images** + **video**; phone-frame preview with theme grades, Ken Burns, transitions
- Filmstrip reorder, hold timing, play/pause
- Draft in `localStorage` + media blobs in IndexedDB
- **Export JSON** for the CLI · **Export video** → browser WebM (VP9/VP8 + Opus beat mux when the browser cooperates)
- Audio panel: 9 catalog beats (Kevin MacLeod CC BY previews), beat-sync, ducking metadata, license badges
- Transition picker on Create (dissolve, push, whip, light-leak, fade-black, zoom-through, slide-up, flash) — themes set defaults
- Attribution: [`catalog/ATTRIBUTION.md`](./catalog/ATTRIBUTION.md)

**Honest limits:** export ≈ real-time length; Safari often skips WebM+Opus; clip camera audio isn’t captured; transitions approximate CSS; CLI ffmpeg render is best-effort parity, not pixel-identical. Cloud encode / HLS / billing = later.

### Sign-in (shell)

Buttons for **Google, Apple, Microsoft, Meta, GitHub**. No client IDs → buttons locked with “Add credentials in .env”. IDs present → OAuth redirect; callback saves a **stub session** (no secret token exchange in the SPA). Full paste-where guide: **[SETUP_AUTH.md](./SETUP_AUTH.md)**.

---

## Catalog richness

- **Themes (10):** Neon Night, Soft Film, Ocean Pop, Golden Hour, Retro VHS, Minimal White, Cyber Lime, Rose Quartz, Documentary Grain, Party Strobe — each with palette, motion, default transition, suggested beat ids
- **Beats (9):** Warm Acoustic, Neon Pulse, Ocean Drift, Funk Loop, Hyperfun, Hot Swing, Lobby Time, Spy Glass, Carefree — short MP3 previews + beatmaps under `catalog/previews/` and `catalog/beats/`
- **Transitions:** cut, dissolve, push, whip, light-leak, fade-black, zoom-through, slide-up, flash (web CSS preview + canvas export + CLI ffmpeg `xfade`)
- **Licenses / credit:** see [`catalog/ATTRIBUTION.md`](./catalog/ATTRIBUTION.md) (Kevin MacLeod / CC BY 3.0)

## Stack

- **Web:** Vite 5, React 18, React Router, TypeScript  
- **Core:** Zod schema + shared tokens (`@voyajes/core`)  
- **CLI:** Node, commander-style `voyajes` binary, ffmpeg for render  
- **Catalog:** JSON manifest (themes + beats)

---

## Prerequisites

- Node 18+
- [pnpm](https://pnpm.io) 9+ (repo pins pnpm 10)
- **ffmpeg** on PATH for `voyajes render` (optional for web-only)

## Install & run

```bash
cd voyajes   # or /workspace/voyajes
pnpm install
pnpm build:core
pnpm build:cli
pnpm dev
```

Open **http://localhost:5173** — Home, Create, Themes, Share (`/v/demo`), Sign-in (`/signin`).

### Optional: social login env

```bash
cp .env.example apps/web/.env
# paste VITE_AUTH_*_CLIENT_ID values — see SETUP_AUTH.md
pnpm dev
```

---

## CLI

```bash
pnpm voyajes --help

pnpm voyajes catalog list --kind theme
pnpm voyajes sync

pnpm voyajes init ./my-voyage \
  --theme theme.ocean-pop \
  --title "Goa 2026" \
  --beat-sync medium \
  --beat audio.warm-acoustic-092

pnpm voyajes doctor ./my-voyage/voyajes.project.json

# WebM (VP9 + Opus) or MP4 — same concepts as Create export
pnpm voyajes render ./my-voyage/voyajes.project.json -o ./my-voyage/out.webm
pnpm voyajes render ./my-voyage/voyajes.project.json -o ./my-voyage/out.mp4 \
  --theme theme.neon-night --beat-sync hard --title "Neon voyage" --quality 1080p
```

| Concept | Web Create | CLI |
| --- | --- | --- |
| Theme grades + transitions | CSS / canvas | ffmpeg `eq`/`colorbalance` + `xfade` |
| Beat-sync holds | soft/medium/hard | `--beat-sync` + project audio |
| On-video title | canvas | `--title` / `drawtext` |
| Beat audio mux | MediaRecorder + AudioContext | catalog preview MP3 via ffmpeg |
| Output | browser WebM download | `-o out.webm` / `-o out.mp4` |

No ffmpeg? `render` still Zod-validates and exits `2` with install hints.

---

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

Validated by `@voyajes/core` (`VoyajesProjectSchema`).

## Themes

| Name | Id | Mood |
| --- | --- | --- |
| Neon Night | `theme.neon-night` | Magenta, snappy, whip |
| Soft Film | `theme.soft-film` | Warm gold, float, dissolve |
| Ocean Pop | `theme.ocean-pop` | Mint/indigo, soft push |
| Golden Hour | `theme.golden-hour` | Coral sun, light-leak |

Source: `catalog/manifest.json` → also `apps/web/public/catalog-manifest.json`.

## Scripts

| Script | What |
| --- | --- |
| `pnpm install` | Workspace deps |
| `pnpm dev` | Vite web app |
| `pnpm build` | Build all |
| `pnpm build:core` / `pnpm build:cli` | Package builds |
| `pnpm voyajes …` | CLI via workspace |

---

## GitHub Pages

**Live:** https://yvelkuri-stu.github.io/voyajes/

Served from the **`gh-pages`** branch (`GITHUB_PAGES=1` → Vite `base: /voyajes/`). SPA fallback via `404.html`.

```bash
./scripts/deploy-gh-pages.sh
# or:
GITHUB_PAGES=1 pnpm --filter @voyajes/core build
GITHUB_PAGES=1 pnpm --filter @voyajes/web build
cp apps/web/dist/index.html apps/web/dist/404.html
# publish apps/web/dist → origin/gh-pages
```

Optional Actions workflow: `.github/workflows/deploy-pages.yml` (needs `workflow` scope to push).

---

## Roadmap

1. ~~Media import + local preview~~  
2. ~~Browser WebM export~~  
3. ~~CLI ffmpeg render~~  
4. ~~Sign-in UI + OAuth setup docs~~ (stub session; real token API next)  
5. Catalog CDN sync + signed stems  
6. Backend OAuth exchange + durable share / HLS  
7. Cloud / Remotion encode + Spark/Pro billing  

---

## License

Source in this repo is published for the Voyajes project — all rights reserved unless a LICENSE file says otherwise.

Now go make something that looks expensive. Your camera roll has been waiting.
