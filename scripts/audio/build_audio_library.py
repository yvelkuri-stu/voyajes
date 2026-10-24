#!/usr/bin/env python3
"""Build the Voyajes audio library from real, licence-verified recordings.

    python3 scripts/audio/build_audio_library.py [--only id,id] [--src /workspace/audio-src]

For every entry in scripts/audio/sources.json:
  1. decode the chosen section to 44.1 kHz stereo float,
  2. loops: detect the beat grid (librosa), cut a whole number of bars starting
     on a downbeat, and equal-power crossfade the tail into the head so the loop
     is seamless; free-time recordings get a longer crossfade,
     sfx: trim to the first onset (or loudest moment) and fade out,
  3. normalise to -14 LUFS (sfx -16 LUFS) with a -1 dBTP limiter,
  4. encode AAC-LC 128 kb/s .m4a (faststart),
  5. analyse the encoded file: BPM, beat grid, 64-bin waveform peaks, LUFS.
Outputs go to catalog/library/audio/*.m4a (+ catalog/previews for theme beats),
and scripts/audio/build-report.json which scripts/audio/apply_audio_manifest.py
folds into the manifests. Requires ffmpeg, numpy, soundfile, librosa.
"""
import argparse, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SR = 44100
UA = {"User-Agent": "VoyajesAudioBuild/1.3 (github.com/yvelkuri-stu/voyajes)"}
MUSIC_LUFS, SFX_LUFS = -14.0, -16.0


def fetch(entry, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return
    if "commons" in entry:
        url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(entry["commons"])
    elif "incompetech" in entry:
        url = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/" + urllib.parse.quote(entry["incompetech"])
    else:
        raise SystemExit(f"no source for {entry}")
    print("  fetching", url)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r, open(dst, "wb") as f:
        f.write(r.read())


def source_url(entry):
    if "commons" in entry:
        return "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(entry["commons"].replace(" ", "_"))
    t = entry["incompetech"].rsplit(".", 1)[0]
    return "https://incompetech.com/music/royalty-free/index.html?isrc=&Search=Search&keywords=" + urllib.parse.quote(t)


def decode(path, start=0.0, dur=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", str(max(0, start))]
    if dur:
        cmd += ["-t", str(dur)]
    cmd += ["-i", path, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def lufs(path_or_arr):
    tmp = None
    if not isinstance(path_or_arr, str):
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
        sf.write(tmp, path_or_arr, SR, subtype="FLOAT")
        path = tmp
    else:
        path = path_or_arr
    err = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    if tmp:
        os.unlink(tmp)
    summ = err[err.rfind("Summary:"):]
    i = float(re.search(r"I:\s+(-?[\d.]+|-inf)\s+LUFS", summ).group(1))
    tp = re.search(r"Peak:\s+(-?[\d.]+|-inf)\s+dBFS", summ)
    return i, (float(tp.group(1)) if tp else None)


def fold_bpm(bpm, lo=70.0, hi=165.0):
    while bpm < lo:
        bpm *= 2
    while bpm > hi:
        bpm /= 2
    return bpm


def beat_grid(mono, hint=None):
    import librosa
    onset = librosa.onset.onset_strength(y=mono, sr=SR, hop_length=512)
    kw = {"start_bpm": hint} if hint else {}
    tempo, frames = librosa.beat.beat_track(onset_envelope=onset, sr=SR, hop_length=512, units="frames", **kw)
    tempo = float(np.atleast_1d(tempo)[0])
    times = librosa.frames_to_time(frames, sr=SR, hop_length=512)
    # pulse clarity: autocorrelation peak of the onset envelope at the beat period
    clarity = 0.0
    if tempo > 0 and len(onset) > 64:
        o = onset - onset.mean()
        ac = np.correlate(o, o, mode="full")[len(o) - 1:]
        ac /= ac[0] + 1e-9
        lag = int(round(60.0 / tempo * SR / 512))
        if 2 < lag < len(ac) - 2:
            clarity = float(ac[lag - 2:lag + 3].max())
    return tempo, times, clarity


def best_section(path, length, total):
    """Pick the loudest, steadiest window between 12% and 85% of the piece."""
    y = decode(path).mean(axis=1)
    hop = SR // 2
    rms = np.sqrt(np.convolve(y ** 2, np.ones(hop) / hop, mode="valid")[::hop] + 1e-12)
    win = int(length * 2) + 8
    lo, hi = int(len(rms) * 0.12), max(int(len(rms) * 0.85) - win, int(len(rms) * 0.12) + 1)
    best, bi = -1e9, lo
    for i in range(lo, min(hi, len(rms) - win)):
        seg = 20 * np.log10(rms[i:i + win])
        score = seg.mean() - 0.6 * seg.std()
        if score > best:
            best, bi = score, i
    return bi * 0.5


def equal_power_loop(seg, start, length, xf):
    out = seg[start:start + length].copy()
    t = np.linspace(0, 1, xf, endpoint=False)[:, None]
    out[:xf] = seg[start:start + xf] * np.sqrt(t) + seg[start + length:start + length + xf] * np.sqrt(1 - t)
    return out


def seam_score(loop):
    """Spectral jump across the loop seam relative to the jumps inside the loop (≈1 = inaudible)."""
    y = loop.mean(axis=1)
    n, w = len(y), 2048
    yy = np.concatenate([y, y])

    def spec(i):
        return np.log1p(np.abs(np.fft.rfft(yy[i:i + w] * np.hanning(w))))
    seam = np.linalg.norm(spec(n - w // 2) - spec(n - w // 2 - w))
    inner = np.median([np.linalg.norm(spec(i) - spec(i - w)) for i in range(w * 2, n - w * 2, max(1, n // 40))])
    return float(seam / (inner + 1e-9))


def grid_from(mono, length, bpb, hint):
    tempo, times, clarity = beat_grid(mono, hint)
    if len(times) < 8:
        return None
    period = float(np.median(np.diff(times)))
    if hint:
        # trust the composer's published tempo when the tracker lands on a different metrical level
        want = 60.0 / hint
        if abs(period / want - 1) > 0.04:
            period = want
            times = times[0] + np.arange(0, int(len(mono) / SR / period)) * period
    b0 = times[0] if times[0] < period * 1.5 else times[0] % period
    bars = max(2, int(round(length / (period * bpb))))
    target = b0 + bars * bpb * period
    near = times[np.argmin(np.abs(times - target))]
    end = near if abs(near - target) < period * 0.25 else target
    return b0, end


def make_loop(entry, path):
    total = duration(path)
    length = float(entry["len"])
    start = entry.get("start", "auto")
    bpb = int(entry.get("beatsPerBar", 4))
    hint = fold_bpm(float(entry["listedBpm"])) if entry.get("listedBpm") else None
    pad = 6.0
    if start == "auto":
        base = best_section(path, length, total)
        cands = [c for c in (base, base + 8, base - 8, base + 16, base - 16, base + 24)
                 if 0 <= c <= total - length - pad - 2]
    else:
        cands = [float(start)]
    best = None
    for c in cands:
        seg = decode(path, c, length + pad + 2)
        mono = seg.mean(axis=1)
        if entry.get("grid", True):
            g = grid_from(mono, length, bpb, hint)
            if not g:
                continue
            b0, end = g
            s, L = int(round(b0 * SR)), int(round((end - b0) * SR))
            xf = int(float(entry.get("xfade", 0.04)) * SR)
        else:
            s, L = 0, int(length * SR)
            xf = int(float(entry.get("xfade", 1.0)) * SR)
        if s + L + xf > len(seg):
            continue
        loop = equal_power_loop(seg, s, L, xf)
        sc = seam_score(loop)
        if best is None or sc < best[0]:
            best = (sc, loop, c + s / SR)
    if best is None:
        raise SystemExit(f"{entry['id']}: no usable section")
    print(f"   seam score {best[0]:.2f} over {len(cands)} candidate(s)")
    return best[1], best[2]


def make_sfx(entry, path):
    y = decode(path)
    mono = np.abs(y).max(axis=1)
    length = int(float(entry["len"]) * SR)
    if entry.get("start") == "loudest":
        win = SR // 20
        env = np.convolve(mono, np.ones(win) / win, mode="same")
        peak = int(np.argmax(env))
        s = max(0, peak - int(length * 0.55))
    else:
        thr = mono.max() * 0.06
        s = max(0, int(np.argmax(mono > thr)) - int(0.01 * SR))
    out = y[s:s + length].copy()
    n = len(out)
    fi = min(int(0.006 * SR), n)
    out[:fi] *= np.linspace(0, 1, fi)[:, None]
    fo = int(n * 0.35)
    out[n - fo:] *= (np.cos(np.linspace(0, np.pi / 2, fo)) ** 2)[:, None]
    return out, s / SR


def encode(arr, target, dst):
    """Gain + limiter + AAC, then re-measure the *encoded* file and correct: AAC can overshoot the
    limiter's ceiling and very dynamic sources lose loudness in the limiter, so iterate (max 5 passes)."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    sf.write(tmp, arr, SR, subtype="FLOAT")
    cur, _ = lufs(tmp)
    gain = target - cur
    limit = 0.84
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    for _ in range(5):
        af = f"volume={gain:.2f}dB,alimiter=limit={limit:.3f}:level=false:attack=3:release=60:latency=true"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", af, "-c:a", "aac", "-b:a", "128k",
                        "-ar", str(SR), "-movflags", "+faststart", dst], check=True)
        I, tp = lufs(dst)
        ok_tp, ok_i = tp <= -1.0, abs(I - target) <= 0.6
        if ok_tp and ok_i:
            break
        if not ok_tp:
            limit = max(0.4, limit * 10 ** ((-1.3 - tp) / 20))
        if not ok_i:
            gain += (target - I) * 1.1
    else:  # never converged: peak safety wins over loudness
        # limit at 4x sample rate so inter-sample (true) peaks of clipped transients are caught too
        gain -= max(0.0, tp + 1.3) * 0.5
        af = (f"volume={gain:.2f}dB,aresample={SR * 4},alimiter=limit={min(limit, 0.7):.3f}:level=false:attack=1:"
              f"release=60:latency=true,lowpass=f=19000,aresample={SR}")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", af, "-c:a", "aac", "-b:a", "128k",
                        "-ar", str(SR), "-movflags", "+faststart", dst], check=True)
    os.unlink(tmp)


def analyse(dst, is_loop, grid, bpb=4, hint=None):
    y = decode(dst)
    mono = y.mean(axis=1)
    dur = len(mono) / SR
    nb = 64
    chunks = np.array_split(np.abs(mono), nb)
    peaks = np.array([c.max() if len(c) else 0 for c in chunks])
    peaks = np.round(peaks / (peaks.max() + 1e-9), 3).tolist()
    I, tp = lufs(dst)
    info = {"durationSec": round(dur, 3), "lufs": round(I, 1), "truePeakDb": tp, "peaks": peaks,
            "sizeBytes": os.path.getsize(dst)}
    if is_loop:
        twice = np.concatenate([mono, mono])  # analyse across the seam
        tempo, times, clarity = beat_grid(twice, hint)
        if hint:
            bpm = hint
        elif len(times) >= 4:
            period = float(np.median(np.diff(times)))
            bpm = fold_bpm(60.0 / period)
        else:
            bpm = fold_bpm(tempo or 90.0)
        period = 60.0 / bpm
        if grid:
            # loop length is a whole number of bars: lock the BPM to it exactly
            beats_in_loop = max(1, round(dur / period))
            bpm = 60.0 * beats_in_loop / dur
            period = dur / beats_in_loop
        first = [t for t in times if t < dur]
        offset = float(np.median([(t % period) for t in first])) if first else 0.0
        if offset > period * 0.9:
            offset -= period
        offset = max(0.0, offset)
        beats = [round(offset + i * period, 3) for i in range(int((dur - offset) / period) + 1) if offset + i * period < dur]
        info.update({"bpm": round(bpm, 2), "beatOffsetSec": round(offset, 3), "beats": beats,
                     "pulse": "steady" if grid or clarity > 0.35 else "free", "beatsPerBar": bpb})
    return info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/workspace/audio-src")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    spec = json.load(open(os.path.join(ROOT, "scripts/audio/sources.json")))
    os.makedirs(a.src, exist_ok=True)
    only = set(x for x in a.only.split(",") if x)
    report_path = os.path.join(ROOT, "scripts/audio/build-report.json")
    report = json.load(open(report_path)) if os.path.exists(report_path) else {"tracks": {}, "catalog": {}}
    lic = spec["licenses"]
    jobs = [("tracks", t) for t in spec["tracks"]]
    for c in spec["catalog"]:
        c = dict(c, id=c["file"], grid=True, author="Kevin MacLeod (incompetech.com)", license="CC BY 3.0", start="auto")
        jobs.append(("catalog", c))
    for group, e in jobs:
        if only and e["id"] not in only:
            continue
        print(f"[{group}] {e['id']}")
        path = os.path.join(a.src, e["src"])
        fetch(e, path)
        is_sfx = e.get("kind") == "sfx"
        if is_sfx:
            arr, at = make_sfx(e, path)
            dst = os.path.join(ROOT, "catalog/library/audio", e["id"] + ".m4a")
        else:
            arr, at = make_loop(e, path)
            dst = os.path.join(ROOT, "catalog/library/audio" if group == "tracks" else "catalog/previews", e["id"] + ".m4a")
        encode(arr, SFX_LUFS if is_sfx else MUSIC_LUFS, dst)
        info = analyse(dst, not is_sfx, e.get("grid", True), int(e.get("beatsPerBar", 4)),
                       fold_bpm(float(e["listedBpm"])) if e.get("listedBpm") and e.get("grid", True) else None)
        info.update({"file": os.path.relpath(dst, ROOT), "sourceStartSec": round(at, 3),
                     "credit": {"work": e["work"], "author": e["author"], "license": e["license"],
                                "licenseUrl": lic[e["license"]], "sourceUrl": source_url(e),
                                **({"note": e["note"]} if e.get("note") else {})}})
        report[group][e.get("catalogId", e["id"])] = info
        print(f"   {info['durationSec']}s  {info['lufs']} LUFS  tp {info['truePeakDb']}  bpm {info.get('bpm')}  {info.get('pulse','sfx')}  {info['sizeBytes']//1024} KB  @ {at:.1f}s")
        json.dump(report, open(report_path, "w"), indent=1)
    print("wrote", report_path)


if __name__ == "__main__":
    main()
