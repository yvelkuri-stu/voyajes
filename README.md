# Voyajes

**Every voyage, in motion.**

Yes, it’s spelled **Voyajes** on purpose. Not a typo. Not autocorrect losing a fight with “voyages.” We kept the *j* because it looks like a passport stamp and sounds like you’re already halfway out the door. Say it like *voy-AH-hess* (or yell it at your render queue — both work).

Drop in a messy camera roll. Pick a color & motion theme. Hit play. Walk away with a short film that feels like you meant it — in the browser, or from the CLI your robots already love.

> Theme before timeline. Beauty before spreadsheet energy.

Brand marks live in `brand/icon-app.jpg` / `brand/icon-alt.jpg` and ship as `apps/web/public/brand/logo-*.png` (Logo component, favicon, PWA icons). The wordmark highlights the intentional **j**.

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

**Screens:** Home · Create/Compose · Themes & **Templates** (incl. **Invitation**) · Share · Continue (auth demos) · Kids Mode · Notification bell

**Home testing:** [docs/WORKFLOW.md](./docs/WORKFLOW.md) · **Native later:** [docs/NATIVE_APPS.md](./docs/NATIVE_APPS.md) (**Flutter** locked)

### Create / import / preview / export

- Drag-drop **images** + **video**; phone-frame preview with theme grades, Ken Burns, transitions
- Filmstrip reorder, hold timing, play/pause
- Draft in `localStorage` + media blobs in IndexedDB
- **Templates:** apply a full pack (theme + motion + clip transition + beat + text style defaults)
- **Export…** social presets → YouTube 16:9 · TikTok / IG Reels 9:16 · IG Feed 1:1 / 4:5 (+ duration targets 15/30/60s, watermark stub)
- **Export JSON** for the CLI · **Export WebM** (VP9/VP8 + Opus beat mux when the browser cooperates)
- Audio panel: 9 catalog beats (Kevin MacLeod CC BY previews), beat-sync, ducking metadata, license badges
- Transition + text style / caption presets on Create
- Soft **AI working** feedback (breathing ambient, pulse on Story coach / template apply / export / catalog sync) — respects Kids Mode + reduce-motion
- Attribution: [`catalog/ATTRIBUTION.md`](./catalog/ATTRIBUTION.md) · catalog shipping: [`catalog/CATALOG.md`](./catalog/CATALOG.md)

**Honest limits:** export ≈ real-time length; Safari often skips WebM+Opus; clip camera audio isn’t captured; transitions approximate CSS; CLI ffmpeg render is best-effort parity, not pixel-identical. Cloud encode / HLS / billing = later.

### Sign-in (shell)

Buttons for **Google, Apple, Microsoft, Meta, GitHub**. No client IDs → buttons locked with “Add credentials in .env”. IDs present → OAuth redirect; callback saves a **stub session** (no secret token exchange in the SPA). Full paste-where guide: **[SETUP_AUTH.md](./SETUP_AUTH.md)**.

---

## Catalog richness

- **Themes (10):** Neon Night, Soft Film, Ocean Pop, Golden Hour, Retro VHS, Minimal White, Cyber Lime, Rose Quartz, Documentary Grain, Party Strobe
- **Templates (17):** 14 voyage packs + **3 Invitation packs** (Birthday Blast, Garden Soirée, Candle Wish) — each a unique motion × transition × beat × text-style × text-transition combo
- **Beats (9):** Warm Acoustic, Neon Pulse, Ocean Drift, Funk Loop, Hyperfun, Hot Swing, Lobby Time, Spy Glass, Carefree
- **Transitions:** cut, dissolve, push, whip, light-leak, fade-black, zoom-through, slide-up, flash
- **Licenses / credit:** [`catalog/ATTRIBUTION.md`](./catalog/ATTRIBUTION.md) · **how to ship packs:** [`catalog/CATALOG.md`](./catalog/CATALOG.md)
- **Notifications:** browser Notification API + in-app toast/bell when `catalogVersion` changes


## Invitation mode

Host an animated **birthday / event invite** instead of a regular voyage:

1. **Compose → Invitation** (or Home → **New invitation**, or `/create?mode=invitation`).
2. Pick an **Invitation** template (Birthday Blast, Garden Soirée, Candle Wish) — theme, transitions, beat, and text styles apply as usual.
3. Add photos/clips + title/caption overlays; **Share** publishes a link.
4. Guests open `/v/:id` for **high-quality animated playback** matching your design (same theme grades, transitions, catalog audio, and text). **Fullscreen** play + an **OG-style** preview card. No compose/edit chrome on the guest view (`?host=1` keeps host controls).

Media still resolves from the host browser’s IndexedDB draft until cloud sync ships — share the link from the device that composed the invite for full playback.

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
  --template template.coastal-bounce \
  --title "Goa 2026" \
  --beat-sync medium

# or pick theme/beat/transition explicitly:
pnpm voyajes init ./my-voyage \
  --theme theme.ocean-pop \
  --transition push \
  --beat audio.warm-acoustic-092 \
  --audio ./my-sound.mp3

pnpm voyajes doctor ./my-voyage/voyajes.project.json

# WebM (VP9 + Opus) or MP4 — same concepts as Create export
pnpm voyajes render ./my-voyage/voyajes.project.json -o ./my-voyage/out.webm
pnpm voyajes render ./my-voyage/voyajes.project.json -o ./my-voyage/out.mp4 \
  --theme theme.neon-night --beat-sync hard --title "Neon voyage" --quality 1080p

# Social presets set aspect (YouTube 16:9, TikTok/Reels 9:16, IG 1:1 / 4:5)
pnpm voyajes render ./my-voyage/voyajes.project.json -o out-tt.webm \
  --preset tiktok --quality 1080p
pnpm voyajes catalog list --kind template
```

| Concept | Web Create | CLI |
| --- | --- | --- |
| Theme grades + transitions | CSS / canvas | ffmpeg `eq`/`colorbalance` + `xfade` |
| Per-clip transitions | filmstrip gap picker | `media[].transitionOut` + `--transition` / template |
| Text overlays + styles | timeline cards | `text[]` + `--text-style` / `--text-transition` (`drawtext`) |
| Templates (14) | Themes / Create apply | `init --template` · `render --template` · `catalog list --kind template` |
| Custom audio import | file picker → IndexedDB | `--audio <path>` → `audio/` + `custom:<id>` |
| Beat-sync holds | soft/medium/hard | `--beat-sync` + project audio |
| Export presets | YT / TikTok / IG | `--preset` + `--aspect` + `--duration-target` + `--watermark` |
| On-video title | canvas | `--title` / `drawtext` |
| Beat audio mux | MediaRecorder + AudioContext | catalog preview MP3 or custom file via ffmpeg |
| Output | browser WebM download | `-o out.webm` / `-o out.mp4` |

```bash
# Template + custom sound + TikTok preset
pnpm voyajes init ./trip --template template.pulse-reels --audio ./beat.mp3
pnpm voyajes render ./trip/voyajes.project.json -o trip-tt.webm --preset tiktok --duration-target 30
```

No ffmpeg? `render` still Zod-validates and exits `2` with install hints.

### CLI intentional gaps (web-only)

These Create / shell features stay **web-only** on purpose — no CLI parity planned short-term:

| Gap | Why |
| --- | --- |
| **Kids Mode** / stickers / Memory jar / guardian comments | UI prefs + localStorage UX, not project schema |
| **Story coach** copy suggestions | Client-side wording helper; paste title/caption into project JSON if needed |
| **IndexedDB blob media** (`local:…` paths) | CLI needs real filesystem paths under the project folder |
| **Pixel-identical transitions / Ken Burns / text animations** | ffmpeg `xfade` + `drawtext` approximate CSS/canvas preview |
| **Browser Notification / catalog toast bell** | `voyajes sync` covers catalog refresh on disk |
| **PWA install prompt / OAuth Continue flow** | Browser shell only |

Honest render limits still apply: ≈ real-time encode, Safari WebM quirks on web, clip camera audio not captured, cloud encode later.

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
5. ~~14 templates + catalog notify + social export presets~~  
6. Catalog CDN sync + signed stems  
7. Backend OAuth exchange + durable share / HLS  
8. Cloud / Remotion encode + Spark/Pro billing  

---

## License

Source in this repo is published for the Voyajes project — all rights reserved unless a LICENSE file says otherwise.

Now go make something that looks expensive. Your camera roll has been waiting.
