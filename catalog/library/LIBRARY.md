# Voyajes free media library

Curated **first-party** futuristic / colorful assets shipped with the app (`public/library/`).

## License

All photos and audio in this folder are **original Voyajes works** created for the product:

- **Photos** — procedurally generated abstract art (gradients, grids, orbs, skylines). Not scraped from stock sites.
- **Audio** — synthetic ambient pads / tones generated with open tools (ffmpeg lavfi). No third-party samples.

**You may use these assets freely inside Voyajes projects** (create, invite, export, share). Redistribution of the raw library files outside Voyajes should keep this credit:

> Media from the Voyajes free library — original abstract / synthetic assets © Voyajes contributors.

No CC0 stock was copied. If you later add external CC0/CC BY packs, list them below with source URLs.

## Manifest

See `manifest.json` for `id`, `title`, `kind` (`photo` | `audio` | `video`), `tags`, and relative `url` paths (resolved with the app base, e.g. `/voyajes/` on GitHub Pages).

## Contents (2026.10.07.1)

### Photos (12)

Neon Corridor · Aurora Drift · Magenta Orbit · Cyber Horizon · Prism Cascade · Void Bloom · Mint Nebula · Solar Flare · Glass City · Plasma Ring · Chromatic Mesh · Starfield Pop

### Audio (6)

Soft Pad · Deep Hum · Crystal Shimmer · Pink Drift · Aurora Wash · Pulse Glow


## Template sample library (2026.10.09.1)

Every template ships as a **complete, playable sample project** (`samples.json`): 3 library images,
a music loop + a short stinger on the audio track, transitions, animated text layers and a colour grade.
Invitation samples include placeholder host / event / when / where text that users overwrite.

All sample assets are **original, procedurally generated** by `scripts/gen_library_samples.py`
(Python + PIL/numpy for images, numpy synthesis → ffmpeg for audio). No stock photos, no samples,
no third-party recordings. Same licence as above: free to use in Voyajes projects.

Regenerate (deterministic):

```bash
python3 scripts/gen_library_samples.py   # writes catalog/library + mirrors to apps/web/public/library
```

Sizes: images 960×960 WebP (~15–40 KB) + 240px thumbs; loops ~8–10 s mono 48 kbps MP3 (~50–110 KB); stingers ~1.6 s.

### Sample photos (33)

- `lib.photo.bday-balloons` — Balloon Bash (birthday, party, balloons, birthday)
- `lib.photo.bday-confetti` — Confetti Storm (birthday, party, confetti, birthday)
- `lib.photo.bday-cake` — Candle Cake (birthday, cake, candles, birthday)
- `lib.photo.wed-rings` — Golden Rings (wedding, rings, romantic, wedding)
- `lib.photo.wed-petals` — Petal Rain (wedding, petals, garden, wedding)
- `lib.photo.wed-arch` — Garden Arch (wedding, arch, ceremony, wedding)
- `lib.photo.anni-hearts` — Floating Hearts (anniversary, love, hearts, anniversary)
- `lib.photo.anni-glow` — Candle Glow (anniversary, candles, warm, anniversary)
- `lib.photo.anni-rings` — Twin Rings (anniversary, rings, anniversary)
- `lib.photo.baby-clouds` — Moon & Clouds (baby-shower, pastel, moon, baby)
- `lib.photo.baby-stars` — Pastel Stars (baby-shower, stars, pastel, baby)
- `lib.photo.baby-bubbles` — Soft Bubbles (baby-shower, bubbles, soft, baby)
- `lib.photo.party-disco` — Disco Ball (party, night, disco, party)
- `lib.photo.party-lasers` — Laser Floor (party, neon, lasers, party)
- `lib.photo.party-neon-confetti` — Neon Confetti (party, confetti, neon, party)
- `lib.photo.grad-caps-toss` — Caps Toss (graduation, caps, celebrate, graduation)
- `lib.photo.grad-stars` — Gold Stars (graduation, stars, gold, graduation)
- `lib.photo.grad-sunrise` — Bright Future (graduation, sunrise, future, graduation)
- `lib.photo.fest-diyas` — Diya Row (festival, diwali, lights, festival)
- `lib.photo.fest-rangoli` — Rangoli Bloom (festival, diwali, rangoli, festival)
- `lib.photo.fest-fireworks` — Festival Fireworks (festival, fireworks, night, festival)
- `lib.photo.hol-ornaments` — Ornament Swing (holiday, ornaments, winter, holiday)
- `lib.photo.hol-snowfall` — Snowy Pines (holiday, snow, pines, holiday)
- `lib.photo.hol-lights` — Twinkle Lights (holiday, lights, bokeh, holiday)
- `lib.photo.trv-peaks` — Sunset Peaks (travel, mountains, sunset, travel)
- `lib.photo.trv-ocean` — Ocean Lines (travel, ocean, waves, travel)
- `lib.photo.trv-road` — Open Road (travel, road, adventure, travel)
- `lib.photo.cozy-window` — Morning Window (cozy, home, brunch, cozy)
- `lib.photo.cozy-table` — Dinner Table (cozy, dinner, candles, cozy)
- `lib.photo.cozy-home` — Warm Home (cozy, housewarming, home, cozy)
- `lib.photo.retro-grid` — Retro Grid Sun (retro, vhs, synthwave, retro)
- `lib.photo.retro-checker` — Checker Dance (retro, swing, vintage, retro)
- `lib.photo.retro-gallery` — Gallery Frame (minimal, gallery, clean, retro)

### Sample music & stingers (14)

- `lib.audio.birthday-bounce` — Birthday Bounce · 124 BPM · 7.74s (birthday, party, upbeat, loop)
- `lib.audio.wedding-strings` — Wedding Strings · 72 BPM · 13.33s (wedding, romantic, soft, loop)
- `lib.audio.lullaby-bells` — Lullaby Bells · 84 BPM · 11.43s (baby-shower, gentle, bells, loop)
- `lib.audio.party-pulse` — Party Pulse · 126 BPM · 7.62s (party, night, dance, loop)
- `lib.audio.grad-anthem` — Grad Anthem · 110 BPM · 8.73s (graduation, uplifting, loop)
- `lib.audio.festival-lights` — Festival Lights · 100 BPM · 9.6s (festival, diwali, bells, loop)
- `lib.audio.holiday-chimes` — Holiday Chimes · 96 BPM · 10.0s (holiday, winter, chimes, loop)
- `lib.audio.travel-breeze` — Travel Breeze · 98 BPM · 9.8s (travel, breezy, acoustic, loop)
- `lib.audio.cozy-keys` — Cozy Keys · 80 BPM · 12.0s (cozy, dinner, brunch, loop)
- `lib.audio.love-waltz` — Love Waltz · 90 BPM · 10.67s (anniversary, romantic, loop)
- `lib.audio.retro-groove` — Retro Groove · 108 BPM · 8.89s (retro, vhs, funk, loop)
- `lib.audio.stinger-sparkle` — Sparkle Stinger · 1.6s (stinger, sparkle, magic)
- `lib.audio.stinger-whoosh` — Whoosh Stinger · 1.6s (stinger, whoosh, transition)
- `lib.audio.stinger-chime` — Chime Stinger · 1.6s (stinger, chime, reveal)

### Moods → templates

birthday (Birthday Blast, Candle Wish, Kids Party Pop) · wedding (Garden Soirée, Wedding Vows) ·
anniversary (Anniversary Glow, Blush Story) · baby (Baby Shower Bloom) · graduation (Grad Caps) ·
festival (Diwali Lights) · holiday (Holiday Sparkle) · cozy (Housewarming, Dinner Table, Brunch, Golden Recap, Lounge Edit) ·
party (Midnight Metro, Strobe Night, Acid Drop, Pulse Reels) · travel (Travel Postcard, Sunlit Drift, Coastal Bounce, Mint Travel, Field Notes) ·
retro (VHS Party, Swing Retro, Gallery Quiet).

Shared links reference library media and audio **by id** (`lib:<id>`) — they are not embedded, so links stay small.
