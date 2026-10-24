# Catalog attribution

Theme beats under `catalog/previews/` are **seamless, bar-aligned stereo loops** (~16–20 s, -14 LUFS, AAC 128 kb/s .m4a)
cut from the full tracks by `scripts/audio/build_audio_library.py`. Beatmaps in `catalog/beats/*.json` come from beat
tracking on the shipped loop (BPM + beat grid), so beat-sync lines up with the real audio.

## Music

All catalog beats are **Kevin MacLeod** tracks from [incompetech.com](https://incompetech.com/) under
**[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)**.

| Catalog beat | Source track | BPM (detected) | Loop | Preview file |
| --- | --- | --- | --- | --- |
| `audio.warm-acoustic-092` | Easy Lemon | 81.9 | 20.5s | `warm-acoustic.m4a` |
| `audio.neon-pulse-118` | Electrodoodle | 119.9 | 18.0s | `neon-pulse.m4a` |
| `audio.ocean-drift-084` | Floating Cities | 120.0 | 20.0s | `ocean-drift.m4a` |
| `audio.funk-loop-104` | Funk Game Loop | 104.9 | 18.3s | `funk-loop.m4a` |
| `audio.hyperfun-128` | Hyperfun | 100.1 | 16.8s | `hyperfun.m4a` |
| `audio.hot-swing-180` | Hot Swing | 143.6 | 16.7s | `hot-swing.m4a` |
| `audio.lobby-time-096` | Lobby Time | 129.2 | 18.6s | `lobby-time.m4a` |
| `audio.spy-glass-100` | Spy Glass | 110.2 | 19.6s | `spy-glass.m4a` |
| `audio.carefree-140` | Carefree | 96.2 | 17.5s | `carefree.m4a` |

**Required credit (CC BY 3.0):**
Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 3.0 — https://creativecommons.org/licenses/by/3.0/

Voyajes `license` badges (`personal` / `creator` / …) describe catalog packaging tiers inside the app, not a
replacement for the underlying CC BY terms. Keep attribution when redistributing these files.

The wider sound library (Indian ceremony instruments, lullabies, SFX …) is credited per track in
`catalog/library/LIBRARY.md` and on the in-app Credits page.

## Sources considered

- **incompetech.com** — used (CC BY 3.0)
- **Wikimedia Commons** — used for CC0 / PD / CC BY field recordings (licence read from each file page)
- **Freesound.org** — blocked (HTTP 403) from the build environment; Freesound-origin files were taken via their Commons mirrors
- **freepd.com** — offline; **Pixabay / Mixkit** — blocked and licence unsuitable for redistributing raw files
- Rejected: NC / ND / share-alike items, archive.org uploads with doubtful "public domain" marks, commercial recordings
