#!/usr/bin/env python3
"""Fold scripts/audio/build-report.json into the library + catalog manifests,
regenerate beatmaps, credits docs, and mirror everything into apps/web/public.

    python3 scripts/audio/apply_audio_manifest.py
"""
import glob, json, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LIB = os.path.join(ROOT, "catalog/library")
PUB_LIB = os.path.join(ROOT, "apps/web/public/library")
CAT = os.path.join(ROOT, "catalog")
PUB_CAT = os.path.join(ROOT, "apps/web/public/catalog")
LIB_VERSION = "2026.10.23.1"
CATEGORY_LABEL = {"festive-indian": "Festive Indian", "devotional": "Devotional", "lullaby": "Lullaby", "upbeat": "Upbeat",
                  "cinematic": "Cinematic", "chill": "Chill", "genz": "Gen Z", "sfx": "SFX"}
# Ceremony templates get a real auspicious stinger instead of a generic chime.
CEREMONY_STING = {"template.mundan-sanskar": "sfx-conch", "template.puttu-ventrukalu": "sfx-temple-bell",
                  "template.mottai-kaathu-kuthu": "sfx-temple-bell", "template.first-haircut": "stinger-sparkle"}


def credit_line(c):
    return f"\u201c{c['work']}\u201d by {c['author']} \u2014 {c['license']}"


def main():
    spec = json.load(open(os.path.join(ROOT, "scripts/audio/sources.json")))
    rep = json.load(open(os.path.join(ROOT, "scripts/audio/build-report.json")))
    man_path = os.path.join(LIB, "manifest.json")
    man = json.load(open(man_path))
    items = [i for i in man["items"] if i["kind"] != "audio"]
    audio = []
    for t in spec["tracks"]:
        r = rep["tracks"][t["id"]]
        sfx = t.get("kind") == "sfx"
        item = {"id": f"lib.audio.{t['id']}", "title": t["title"], "kind": "audio",
                "tags": list(dict.fromkeys(t["tags"] + [t["category"], "sfx" if sfx else "loop"])),
                "category": t["category"], "audioType": "sfx" if sfx else "loop",
                "url": f"library/audio/{t['id']}.m4a", "durationSec": r["durationSec"],
                "sizeBytes": r["sizeBytes"], "lufs": r["lufs"], "peaks": [round(p, 2) for p in r["peaks"]],
                "sample": True}
        if t["id"].startswith("ceremony-"):
            item["ceremony"] = True
        if not sfx:
            item.update({"bpm": r["bpm"], "beatOffsetSec": r["beatOffsetSec"], "beatsPerBar": r["beatsPerBar"], "pulse": r["pulse"]})
        item["credit"] = r["credit"]
        audio.append(item)
    man["items"] = items + audio
    man["libraryVersion"] = LIB_VERSION
    man["generatedAt"] = "2026-10-23T12:00:00Z"
    man["license"] = ("Photos: original Voyajes abstract art. Audio: real recordings under CC0 / public domain / CC BY "
                      "(per-item `credit`; see LIBRARY.md and the in-app Credits page).")
    man["audioCategories"] = [{"id": k, "label": v} for k, v in CATEGORY_LABEL.items()]
    json.dump(man, open(man_path, "w"), indent=2, ensure_ascii=False)

    # samples: real auspicious stingers on ceremony templates
    sp = os.path.join(LIB, "samples.json")
    samples = json.load(open(sp))
    dur = {i["id"]: i["durationSec"] for i in audio}
    for tid, sting in CEREMONY_STING.items():
        s = samples["samples"].get(tid)
        if not s:
            continue
        for a in s["audio"]:
            if not a.get("loop"):
                a["ref"] = f"lib:lib.audio.{sting}"
                a["durationSec"] = round(min(dur[f"lib.audio.{sting}"], 4.0), 2)
    samples["libraryVersion"] = LIB_VERSION
    json.dump(samples, open(sp, "w"), indent=1, ensure_ascii=False)

    # remove old synthesized mp3s
    for f in glob.glob(os.path.join(LIB, "audio", "*.mp3")) + glob.glob(os.path.join(CAT, "previews", "*.mp3")):
        os.remove(f)

    # catalog beats
    cat_path = os.path.join(CAT, "manifest.json")
    cat = json.load(open(cat_path))
    for c in spec["catalog"]:
        r = rep["catalog"][c["catalogId"]]
        p = next(p for p in cat["packs"] if p["id"] == c["catalogId"])
        p["bpm"] = round(r["bpm"])
        p["bpmExact"] = r["bpm"]
        p["previewUrl"] = f"/catalog/previews/{c['file']}.m4a"
        p["beatmapUrl"] = f"/catalog/beats/{c['file']}.json"
        p["sizeBytes"] = r["sizeBytes"]
        p["durationSec"] = r["durationSec"]
        p["category"] = c["category"]
        p["peaks"] = [round(x, 2) for x in r["peaks"]]
        p["credit"] = r["credit"]
        p["attribution"] = f"Kevin MacLeod \u2014 {c['work']} (CC BY 3.0)"
        p["previewNote"] = f"{round(r['durationSec'])}s seamless bar-aligned loop from {c['work']}, -14 LUFS AAC"
        bpb = r.get("beatsPerBar", 4)
        beats = r["beats"]
        json.dump({"schema": 1, "bpm": r["bpm"], "timeSignature": [bpb, 4], "durationSec": r["durationSec"],
                   "offsetSec": r["beatOffsetSec"], "beats": beats, "bars": beats[::bpb],
                   "source": "librosa beat tracking on the shipped loop"},
                  open(os.path.join(CAT, "beats", f"{c['file']}.json"), "w"))
    cat["generatedAt"] = "2026-10-23T12:00:00Z"
    json.dump(cat, open(cat_path, "w"), indent=2, ensure_ascii=False)
    shutil.copy(cat_path, os.path.join(ROOT, "apps/web/public/catalog-manifest.json"))

    write_docs(spec, rep, audio)

    # mirror
    for sub in ("audio",):
        dst = os.path.join(PUB_LIB, sub)
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(os.path.join(LIB, sub), dst)
    for f in ("manifest.json", "samples.json", "LIBRARY.md"):
        shutil.copy(os.path.join(LIB, f), os.path.join(PUB_LIB, f))
    for sub in ("previews", "beats"):
        dst = os.path.join(PUB_CAT, sub)
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(os.path.join(CAT, sub), dst)
    shutil.copy(os.path.join(CAT, "ATTRIBUTION.md"), os.path.join(PUB_CAT, "ATTRIBUTION.md"))
    print("audio items", len(audio), "catalog beats", len(spec["catalog"]))


def write_docs(spec, rep, audio):
    rows = []
    for i in audio:
        c = i["credit"]
        bpm = f"{i['bpm']:.0f}" if "bpm" in i else "\u2014"
        rows.append(f"| `{i['id']}` | {i['title']} | {CATEGORY_LABEL[i['category']]} | {bpm} | {i['durationSec']:.1f}s | "
                    f"[{c['work']}]({c['sourceUrl']}) | {c['author']} | [{c['license']}]({c['licenseUrl']}) |")
    by = sorted({i["credit"]["author"] for i in audio if i["credit"]["license"].startswith("CC BY")})
    notes = [f"- **{i['title']}** (`{i['id']}`): {i['credit']['note']}" for i in audio if i["credit"].get("note")]
    lib_md_path = os.path.join(LIB, "LIBRARY.md")
    old = open(lib_md_path).read()
    head = old.split("## Template sample library")[0]
    head = head.replace("- **Audio** \u2014 synthetic ambient pads / tones generated with open tools (ffmpeg lavfi). No third-party samples.",
                        "- **Audio** \u2014 since v1.3.0, **real recordings** under CC0 / public domain / CC BY (see *Audio credits* below). The old synthesized loops were removed.")
    head = head.replace("All photos and audio in this folder are **original Voyajes works** created for the product:",
                        "Photos in this folder are **original Voyajes works**; audio is third-party, licence-verified (credits below):")
    rest = "## Template sample library" + old.split("## Template sample library", 1)[1] if "## Template sample library" in old else ""
    # drop any previous audio-credit section and the old synth audio notes
    rest = rest.split("\n## Audio credits")[0]
    rest = rest.replace("(Python + PIL/numpy for images, numpy synthesis \u2192 ffmpeg for audio). No stock photos, no samples,\nno third-party recordings. Same licence as above: free to use in Voyajes projects.",
                        "(Python + PIL/numpy). Template **audio** now comes from the real-recording library below.")
    md = head + rest.rstrip() + f"""

## Audio credits (library {LIB_VERSION})

Built by `scripts/audio/build_audio_library.py` from `scripts/audio/sources.json`: each source is cut to a
whole number of bars (or crossfaded for free-time recordings), equal-power crossfaded so it loops seamlessly,
normalised to **-14 LUFS** (SFX -16 LUFS, -1 dBTP limiter), and encoded **AAC-LC 128 kb/s .m4a**. BPM, beat
offset and 64-bin waveform peaks are measured on the shipped file and stored in `manifest.json`.

Every licence below was checked at the source page (Wikimedia Commons file page / incompetech.com) on 2026-10-23.
Only CC0, public domain and CC BY are used \u2014 **no NC, ND or share-alike, no rips**. CC BY tracks require credit:
the app shows it on the **Credits** page (Settings \u2192 Credits / `#/credits`) and in the audio browser, and users who
publish a video should paste the credit line (the audio browser has a *Copy credit* button).

| ID | Title | Category | BPM | Length | Source work | Author | Licence |
| --- | --- | --- | --- | --- | --- | --- | --- |
{chr(10).join(rows)}

Notes:
{chr(10).join(notes)}

**CC BY authors to credit:** {", ".join(by)}.

Kevin MacLeod credit text (CC BY 3.0): *Music by Kevin MacLeod (incompetech.com) \u2014 Licensed under Creative Commons: By Attribution 3.0 \u2014 https://creativecommons.org/licenses/by/3.0/*

Rebuild: `python3 scripts/audio/build_audio_library.py && python3 scripts/audio/apply_audio_manifest.py`
(sources are downloaded from the URLs above into `--src`, default `/workspace/audio-src`).
"""
    open(lib_md_path, "w").write(md)

    crow = []
    for c in spec["catalog"]:
        r = rep["catalog"][c["catalogId"]]
        crow.append(f"| `{c['catalogId']}` | {c['work']} | {r['bpm']:.1f} | {r['durationSec']:.1f}s | `{c['file']}.m4a` |")
    at = f"""# Catalog attribution

Theme beats under `catalog/previews/` are **seamless, bar-aligned stereo loops** (~16\u201320 s, -14 LUFS, AAC 128 kb/s .m4a)
cut from the full tracks by `scripts/audio/build_audio_library.py`. Beatmaps in `catalog/beats/*.json` come from beat
tracking on the shipped loop (BPM + beat grid), so beat-sync lines up with the real audio.

## Music

All catalog beats are **Kevin MacLeod** tracks from [incompetech.com](https://incompetech.com/) under
**[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)**.

| Catalog beat | Source track | BPM (detected) | Loop | Preview file |
| --- | --- | --- | --- | --- |
{chr(10).join(crow)}

**Required credit (CC BY 3.0):**
Music by Kevin MacLeod (incompetech.com) \u2014 Licensed under Creative Commons: By Attribution 3.0 \u2014 https://creativecommons.org/licenses/by/3.0/

Voyajes `license` badges (`personal` / `creator` / \u2026) describe catalog packaging tiers inside the app, not a
replacement for the underlying CC BY terms. Keep attribution when redistributing these files.

The wider sound library (Indian ceremony instruments, lullabies, SFX \u2026) is credited per track in
`catalog/library/LIBRARY.md` and on the in-app Credits page.

## Sources considered

- **incompetech.com** \u2014 used (CC BY 3.0)
- **Wikimedia Commons** \u2014 used for CC0 / PD / CC BY field recordings (licence read from each file page)
- **Freesound.org** \u2014 blocked (HTTP 403) from the build environment; Freesound-origin files were taken via their Commons mirrors
- **freepd.com** \u2014 offline; **Pixabay / Mixkit** \u2014 blocked and licence unsuitable for redistributing raw files
- Rejected: NC / ND / share-alike items, archive.org uploads with doubtful "public domain" marks, commercial recordings
"""
    open(os.path.join(CAT, "ATTRIBUTION.md"), "w").write(at)


if __name__ == "__main__":
    main()
