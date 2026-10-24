# Voyajes free media library

Curated **first-party** futuristic / colorful assets shipped with the app (`public/library/`).

## License

Photos in this folder are **original Voyajes works**; audio is third-party, licence-verified (credits below):

- **Photos** — procedurally generated abstract art (gradients, grids, orbs, skylines). Not scraped from stock sites.
- **Audio** — since v1.3.0, **real recordings** under CC0 / public domain / CC BY (see *Audio credits* below). The old synthesized loops were removed.

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
(Python + PIL/numpy). Template **audio** now comes from the real-recording library below.

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


## Gen Z / Gen Alpha template art (2026.10.10.1)

Every template now has **its own three images** (`lib.photo.tpl-<template>-1..3`, 84 total, 640×640 WebP
≈20–45 KB + 240px thumbs) — the first one is the template's distinct gallery cover. Looks: Y2K holographic
gradients, liquid chrome, neon grids, RGB-split glitch + scanlines, die-cut stickers (smileys, hearts, stars)
with white borders + drop shadows, wavy checkerboards, halftone, grainy film + light leaks, plus a word
sticker per image ("YAY!", "NIGHT MODE", "HAPPY DIWALI", "I DO", "CLASS OF '26", "REC ●"…).

Each sample also pre-selects punchy transitions (whip, glitch, zoom-through "zoom punch", flash, spin,
heart-wipe), pop / zoom-in / slide-up clip animations and a matching text style.

Generated in code by `scripts/gen_genz_samples.py` (Python + PIL/numpy; reuses motif painters from
`gen_library_samples.py`). Word stickers are rasterized with SIL Open Font License Google Fonts
(Luckiest Guy, Bangers, Rubik Mono One, Shrikhand, Monoton, Press Start 2P, Permanent Marker) — OFL
permits using the fonts to create artwork. No stock photos, no third-party art. The earlier mood
images (`lib.photo.bday-balloons`, …) stay in the library so v0.5.0/0.5.1 share links keep resolving.

```bash
python3 scripts/gen_library_samples.py && (cd scripts && python3 gen_genz_samples.py)
```

## Audio credits (library 2026.10.23.1)

Built by `scripts/audio/build_audio_library.py` from `scripts/audio/sources.json`: each source is cut to a
whole number of bars (or crossfaded for free-time recordings), equal-power crossfaded so it loops seamlessly,
normalised to **-14 LUFS** (SFX -16 LUFS, -1 dBTP limiter), and encoded **AAC-LC 128 kb/s .m4a**. BPM, beat
offset and 64-bin waveform peaks are measured on the shipped file and stored in `manifest.json`.

Every licence below was checked at the source page (Wikimedia Commons file page / incompetech.com) on 2026-10-23.
Only CC0, public domain and CC BY are used — **no NC, ND or share-alike, no rips**. CC BY tracks require credit:
the app shows it on the **Credits** page (Settings → Credits / `#/credits`) and in the audio browser, and users who
publish a video should paste the credit line (the audio browser has a *Copy credit* button).

| ID | Title | Category | BPM | Length | Source work | Author | Licence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `lib.audio.ceremony-shehnai` | Shehnai & Veena Blessing | Festive Indian | 148 | 19.5s | [Veena And Shenai](https://commons.wikimedia.org/wiki/File:Veena_And_Shenai_%28Antti_Luode%29.mp3) | Antti Luode | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.ceremony-nadaswaram` | Temple Nadaswaram | Festive Indian | 115 | 24.0s | [Thakil & Nadaswaram during temple Deeparadhana](https://commons.wikimedia.org/wiki/File:Thakil_%26_Nadaswaram_during_temple_Deeparadhana.ogg) | Vis M | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `lib.audio.ceremony-nadaswaram-bright` | Mangala Vadyam | Festive Indian | 116 | 24.0s | [Thakil & Nadaswaram during temple Deeparadhana](https://commons.wikimedia.org/wiki/File:Thakil_%26_Nadaswaram_during_temple_Deeparadhana.ogg) | Vis M | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `lib.audio.ceremony-musicbox` | First Snip Music Box | Lullaby | 89 | 22.0s | [Lullaby wound up clock](https://commons.wikimedia.org/wiki/File:Lullaby_wound_up_clock.ogg) | stephan (pdsounds.org) | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) |
| `lib.audio.festive-dhol` | Dhol Baraat | Festive Indian | 88 | 16.4s | [DHOL BEAT](https://commons.wikimedia.org/wiki/File:DHOL_BEAT.wav) | Johnny Kalsi (The Dhol Foundation) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.festive-chenda` | Chenda Melam | Festive Indian | 105 | 18.0s | [Chenda melam at temple 02](https://commons.wikimedia.org/wiki/File:Chenda_melam_at_temple_02.ogg) | Vis M | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `lib.audio.festival-lights` | Vadodara Lights | Festive Indian | 98 | 19.7s | [Vadodora](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Vadodora) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.festive-naraina` | Naraina | Gen Z | 81 | 20.8s | [Naraina](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Naraina) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.devotional-veena` | Kiravani Veena | Devotional | 152 | 24.0s | [Kiravani (alapana & tanam)](https://commons.wikimedia.org/wiki/File:Kiravani-L_Ramakrishnan.ogg) | L. Ramakrishnan | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `lib.audio.devotional-sarod` | Dhaka Sarod | Devotional | 120 | 22.0s | [Dhaka](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Dhaka) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.chill-jalandhar` | Jalandhar Groove | Chill | 162 | 19.3s | [Jalandhar](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Jalandhar) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.lullaby-bells` | Guten Abend Music Box | Lullaby | 120 | 20.0s | [Lullaby wound up clock ("Guten Abend, gut' Nacht")](https://commons.wikimedia.org/wiki/File:Lullaby_wound_up_clock_guten_abend_gute_nacht.ogg) | stephan (pdsounds.org) | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) |
| `lib.audio.lullaby-victoria` | Melodie Victoria | Lullaby | 89 | 18.9s | [Melodie Victoria](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Melodie%20Victoria) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.birthday-bounce` | Monkeys Spinning Monkeys | Upbeat | 144 | 18.4s | [Monkeys Spinning Monkeys](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Monkeys%20Spinning%20Monkeys) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.party-pulse` | Voxel Revolution | Gen Z | 123 | 15.6s | [Voxel Revolution](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Voxel%20Revolution) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.travel-breeze` | Life of Riley | Upbeat | 101 | 18.9s | [Life of Riley](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Life%20of%20Riley) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.upbeat-happy-alley` | Happy Alley | Upbeat | 112 | 17.1s | [Happy Alley](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Happy%20Alley) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.holiday-chimes` | Jingle Bells | Upbeat | 120 | 16.0s | [Jingle Bells](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Jingle%20Bells%203) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.retro-groove` | Funkorama | Upbeat | 101 | 18.9s | [Funkorama](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Funkorama) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.grad-anthem` | Americana | Cinematic | 104 | 20.8s | [Americana](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Americana) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.deep-hum` | Long Road Ahead | Cinematic | 74 | 19.5s | [Long Road Ahead B](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Long%20Road%20Ahead%20B) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.cinematic-heroic` | Heroic Age | Cinematic | 130 | 14.8s | [Heroic Age](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Heroic%20Age) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.wedding-strings` | Canon in D | Cinematic | 81 | 23.8s | [Canon in D Major (Pachelbel, arr.)](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Canon%20in%20D%20Major) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.love-waltz` | Court of the Queen | Cinematic | 95 | 20.8s | [Court of the Queen](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Court%20of%20the%20Queen) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.soft-pad` | Dreamer | Chill | 100 | 19.2s | [Dreamer](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Dreamer) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.cozy-keys` | Local Forecast | Chill | 82 | 17.6s | [Local Forecast - Elevator](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Local%20Forecast%20-%20Elevator) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.pink-drift` | Groove Grove | Chill | 70 | 20.6s | [Groove Grove](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Groove%20Grove) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.aurora-wash` | Tropical Waves | Chill | 126 | 20.0s | [Ocean Waves on a Tropical Beach](https://commons.wikimedia.org/wiki/File:Ocean_Waves_on_a_Tropical_Beach.ogg) | Jarrod Stanley | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `lib.audio.crystal-shimmer` | Ascending the Vale | Cinematic | 90 | 21.3s | [Ascending the Vale](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Ascending%20the%20Vale) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.romance-piano` | There is Romance | Chill | 93 | 20.7s | [There is Romance](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=There%20is%20Romance) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.pulse-glow` | Chill Wave | Gen Z | 101 | 18.9s | [Chill Wave](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Chill%20Wave) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.genz-werq` | Werq | Gen Z | 126 | 15.2s | [Werq](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Werq) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.genz-getting-it-done` | Getting it Done | Gen Z | 135 | 14.2s | [Getting it Done](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Getting%20it%20Done) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.genz-cipher` | Cipher | Gen Z | 152 | 12.6s | [Cipher](https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=Cipher2) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `lib.audio.stinger-sparkle` | Wind Chimes | SFX | — | 2.4s | [Windchimes](https://commons.wikimedia.org/wiki/File:Windchimes.ogg) | Esc861 | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) |
| `lib.audio.stinger-whoosh` | Whoosh | SFX | — | 1.6s | [Highway from Bridge, Center (single pass-by)](https://commons.wikimedia.org/wiki/File:Highway_from_bridge_center.ogg) | stephan (pdsounds.org) | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) |
| `lib.audio.stinger-chime` | Bell Ding | SFX | — | 2.6s | [Bell-ring](https://commons.wikimedia.org/wiki/File:Bell-ring.flac) | qubodup | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `lib.audio.sfx-temple-bell` | Temple Ghanta | SFX | — | 4.0s | [Ghanta - leather mallet](https://commons.wikimedia.org/wiki/File:274316_the-very-real-horst_ghanta-leather-mallet-2015-05-16.wav) | the_very_Real_Horst | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `lib.audio.sfx-conch` | Shankh (Conch) | SFX | — | 5.5s | [Conch shell](https://commons.wikimedia.org/wiki/File:Conch_shell.ogg) | Dbolton (Wikimedia Commons) | [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/) |
| `lib.audio.sfx-applause` | Family Applause | SFX | — | 5.0s | [applause-I](https://commons.wikimedia.org/wiki/File:Applause_i.ogg) | thore (pdsounds.org) | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) |
| `lib.audio.sfx-cheer` | Clap & Hurray | SFX | — | 4.5s | [Clapping hurray](https://commons.wikimedia.org/wiki/File:Clapping_hurray.ogg) | starlite (pdsounds.org) | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) |
| `lib.audio.sfx-firecracker` | Diwali Crackers | SFX | — | 4.0s | [Firecracker sounds 2022-12-31T23-25-40](https://commons.wikimedia.org/wiki/File:Firecracker_sounds_2022-12-31T23-25-40.ogg) | Almanta | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `lib.audio.sfx-singing-bowl` | Singing Bowl | SFX | — | 6.0s | [SingingBowl1](https://commons.wikimedia.org/wiki/File:SingingBowl1.ogg) | BambooBeast | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) |
| `lib.audio.sfx-shutter` | Camera Shutter | SFX | — | 1.2s | [Holga shuttersound](https://commons.wikimedia.org/wiki/File:Holga_shuttersound.ogg) | Doitashimashite (nl.wikipedia) | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) |

Notes:
- **Shehnai & Veena Blessing** (`lib.audio.ceremony-shehnai`): Produced track built from sampled shehnai + veena (not a live field recording) - the closest legitimately licensed shehnai we could find.
- **Temple Nadaswaram** (`lib.audio.ceremony-nadaswaram`): Live temple recording (Tamil Nadu). Opening section.
- **Mangala Vadyam** (`lib.audio.ceremony-nadaswaram-bright`): Live temple recording (Tamil Nadu). Closing section with thavil.
- **First Snip Music Box** (`lib.audio.ceremony-musicbox`): Real wind-up music-box recording.
- **Dhol Baraat** (`lib.audio.festive-dhol`): Live dhol recording (via Freesound).
- **Chenda Melam** (`lib.audio.festive-chenda`): Live temple recording (Kerala).
- **Kiravani Veena** (`lib.audio.devotional-veena`): Live veena improvisation, 2004.
- **Guten Abend Music Box** (`lib.audio.lullaby-bells`): Real wind-up music-box recording (Brahms' lullaby).
- **Tropical Waves** (`lib.audio.aurora-wash`): Field recording (ambience, no music).

**CC BY authors to credit:** Antti Luode, Dbolton (Wikimedia Commons), Johnny Kalsi (The Dhol Foundation), Kevin MacLeod (incompetech.com), Vis M.

Kevin MacLeod credit text (CC BY 3.0): *Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 3.0 — https://creativecommons.org/licenses/by/3.0/*

Rebuild: `python3 scripts/audio/build_audio_library.py && python3 scripts/audio/apply_audio_manifest.py`
(sources are downloaded from the URLs above into `--src`, default `/workspace/audio-src`).
