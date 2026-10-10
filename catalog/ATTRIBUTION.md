# Catalog attribution

Preview loops under `catalog/previews/` are short (~12s) mono MP3 excerpts prepared for Voyajes demos.

## Music

All current catalog beats are derived from **Kevin MacLeod** tracks published at [incompetech.com](https://incompetech.com/) under **[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)**.

| Catalog beat | Source track | BPM (catalog) | Preview file |
| --- | --- | --- | --- |
| Warm Acoustic | Easy Lemon | 92 | `warm-acoustic.mp3` |
| Neon Pulse | Electrodoodle | 118 | `neon-pulse.mp3` |
| Ocean Drift | Floating Cities | 84 | `ocean-drift.mp3` |
| Funk Loop | Funk Game Loop | 104 | `funk-loop.mp3` |
| Hyperfun | Hyperfun | 128 | `hyperfun.mp3` |
| Hot Swing | Hot Swing | 180 | `hot-swing.mp3` |
| Lobby Time | Lobby Time | 96 | `lobby-time.mp3` |
| Spy Glass | Spy Glass | 100 | `spy-glass.mp3` |
| Carefree | Carefree | 140 | `carefree.mp3` |

**Required credit (CC BY 3.0):**  
Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 3.0 — https://creativecommons.org/licenses/by/3.0/

Voyajes `license` badges (`personal` / `creator` / …) describe **catalog packaging tiers inside the app**, not a replacement for the underlying CC BY terms. Keep attribution when redistributing these preview files.

Beatmaps in `catalog/beats/*.json` are generated from the listed BPM for sync demos (not artist-authored MIDI).

## Sources considered

- **incompetech.com** — used (CC BY 3.0)
- **freepd.com** — offline at catalog build time (historically CC0 Kevin MacLeod mirrors)
- **mixkit.co / Pixabay** — CDN fetches blocked from this build environment; not bundled

When adding new loops, prefer clearly free / CC0 / CC BY sources, keep files small, and append a row here plus matching `attribution` on the pack in `manifest.json`.
