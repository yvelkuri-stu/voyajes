/**
 * Breeze auto-compose (v0.6) — pure planning, shared by the web app and CLI.
 *
 * Input: analysed media items (EXIF time/GPS, perceptual hash, sharpness).
 * Output: an ordered, beat-aligned 15–30s story plan with transitions,
 * animations, a title and light captions. Deterministic per `seed`, so
 * "Remix" = same items, new seed.
 */
import type { TransitionKind } from "./themes.js";
import type { ClipAnimation, TransitionSpec } from "./timeline.js";

export type BreezeItem = {
  id: string;
  name: string;
  kind: "image" | "video";
  /** import order (fallback sort) */
  order: number;
  /** capture time (ms since epoch, wall-clock encoded as UTC) */
  takenAt?: number;
  lat?: number;
  lon?: number;
  /** 64-bit difference hash, 16 hex chars */
  hash?: string;
  /** Laplacian variance (higher = sharper) */
  sharpness?: number;
  /** video length in seconds */
  sourceSec?: number;
};

export type BreezeOptions = {
  seed: number;
  bpm: number;
  themeTransition: TransitionKind;
  themeAnimation?: ClipAnimation;
  /** force a total; otherwise 15–30s picked from clip count + seed */
  targetSec?: number;
  maxClips?: number;
  /** caption day changes ("Day 2") */
  captions?: boolean;
};

export type BreezeClip = {
  id: string;
  durationSec: number;
  inSec?: number;
  transitionOut: TransitionKind | null;
  transitionSpec?: TransitionSpec;
  animation: ClipAnimation;
};

export type BreezePlan = {
  clips: BreezeClip[];
  dropped: { id: string; reason: "duplicate" | "blurry" | "overflow" }[];
  totalSec: number;
  title: string;
  subtitle?: string;
  place?: string;
  dateLabel?: string;
  captions: { clipIndex: number; text: string }[];
  variant: string;
};

// ───────── helpers ─────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hammingHex(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Chronological when every item has a capture time, else by name/import order. */
export function breezeOrder(items: BreezeItem[]): BreezeItem[] {
  const dated = items.filter((i) => i.takenAt != null).length;
  return [...items].sort((a, b) => {
    if (dated >= Math.ceil(items.length / 2) && a.takenAt != null && b.takenAt != null && a.takenAt !== b.takenAt)
      return a.takenAt - b.takenAt;
    if (dated >= Math.ceil(items.length / 2) && (a.takenAt == null) !== (b.takenAt == null)) return a.takenAt == null ? 1 : -1;
    const n = natural.compare(a.name, b.name);
    return n !== 0 && !/^(image|photo|img)\.\w+$/i.test(a.name) ? n : a.order - b.order;
  });
}

/** Drop near-duplicates (keep the sharper) and clearly blurry shots, keeping ≥ minKeep. */
export function breezeCull(
  ordered: BreezeItem[],
  minKeep = 5,
): { kept: BreezeItem[]; dropped: BreezePlan["dropped"] } {
  const dropped: BreezePlan["dropped"] = [];
  let kept: BreezeItem[] = [];
  for (const it of ordered) {
    const prev = kept[kept.length - 1];
    if (prev && it.hash && prev.hash && it.kind === "image" && prev.kind === "image" && hammingHex(it.hash, prev.hash) <= 8) {
      if ((it.sharpness ?? 0) > (prev.sharpness ?? 0)) {
        dropped.push({ id: prev.id, reason: "duplicate" });
        kept[kept.length - 1] = it;
      } else dropped.push({ id: it.id, reason: "duplicate" });
      continue;
    }
    kept.push(it);
  }
  const sharp = kept.filter((k) => k.kind === "image" && k.sharpness != null).map((k) => k.sharpness as number).sort((a, b) => a - b);
  if (sharp.length >= 4) {
    const median = sharp[Math.floor(sharp.length / 2)];
    const blurry = kept
      .filter((k) => k.kind === "image" && k.sharpness != null && (k.sharpness as number) < median * 0.22)
      .sort((a, b) => (a.sharpness ?? 0) - (b.sharpness ?? 0));
    for (const b of blurry) {
      if (kept.length <= minKeep) break;
      kept = kept.filter((k) => k !== b);
      dropped.push({ id: b.id, reason: "blurry" });
    }
  }
  return { kept, dropped };
}

// ───────── places (offline, tiny) ─────────
/** A deliberately small offline gazetteer: popular trip spots (name, lat, lon). */
export const BREEZE_PLACES: [string, number, number][] = [
  ["Goa", 15.5, 73.9], ["Mumbai", 19.08, 72.88], ["Delhi", 28.61, 77.21], ["Bengaluru", 12.97, 77.59],
  ["Hyderabad", 17.39, 78.49], ["Chennai", 13.08, 80.27], ["Kolkata", 22.57, 88.36], ["Jaipur", 26.91, 75.79],
  ["Udaipur", 24.58, 73.71], ["Agra", 27.18, 78.01], ["Kerala", 9.93, 76.27], ["Munnar", 10.09, 77.06],
  ["Manali", 32.24, 77.19], ["Leh", 34.15, 77.58], ["Rishikesh", 30.09, 78.27], ["Pondicherry", 11.94, 79.81],
  ["Coorg", 12.42, 75.74], ["Ooty", 11.41, 76.7], ["Darjeeling", 27.04, 88.26], ["Andaman", 11.67, 92.74],
  ["Dubai", 25.2, 55.27], ["Singapore", 1.35, 103.82], ["Bangkok", 13.76, 100.5], ["Phuket", 7.88, 98.39],
  ["Bali", -8.34, 115.09], ["Kuala Lumpur", 3.14, 101.69], ["Tokyo", 35.68, 139.69], ["Kyoto", 35.01, 135.77],
  ["Seoul", 37.57, 126.98], ["Hong Kong", 22.32, 114.17], ["Maldives", 3.2, 73.22], ["Sri Lanka", 7.29, 80.63],
  ["Kathmandu", 27.72, 85.32], ["London", 51.51, -0.13], ["Paris", 48.86, 2.35], ["Rome", 41.9, 12.5],
  ["Barcelona", 41.39, 2.17], ["Amsterdam", 52.37, 4.9], ["Lisbon", 38.72, -9.14], ["Santorini", 36.39, 25.46],
  ["Istanbul", 41.01, 28.98], ["Swiss Alps", 46.56, 7.98], ["Iceland", 64.15, -21.94], ["Prague", 50.08, 14.44],
  ["New York", 40.71, -74.01], ["San Francisco", 37.77, -122.42], ["Los Angeles", 34.05, -118.24], ["Seattle", 47.61, -122.33],
  ["Las Vegas", 36.17, -115.14], ["Yosemite", 37.87, -119.54], ["Grand Canyon", 36.11, -112.11], ["Hawaii", 21.31, -157.86],
  ["Miami", 25.76, -80.19], ["Chicago", 41.88, -87.63], ["Toronto", 43.65, -79.38], ["Vancouver", 49.28, -123.12],
  ["Banff", 51.18, -115.57], ["Mexico City", 19.43, -99.13], ["Cancún", 21.16, -86.85], ["Rio", -22.91, -43.17],
  ["Cape Town", -33.92, 18.42], ["Sydney", -33.87, 151.21], ["Melbourne", -37.81, 144.96], ["Queenstown", -45.03, 168.66],
];

export function nearestPlace(lat: number, lon: number, maxKm = 90): string | undefined {
  let best: string | undefined;
  let bestKm = maxKm;
  for (const [name, a, b] of BREEZE_PLACES) {
    const dLat = ((a - lat) * Math.PI) / 180;
    const dLon = ((b - lon) * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((a * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const km = 12742 * Math.asin(Math.sqrt(h));
    if (km < bestKm) {
      bestKm = km;
      best = name;
    }
  }
  return best;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateRangeLabel(times: number[]): string | undefined {
  if (!times.length) return undefined;
  const a = new Date(Math.min(...times));
  const b = new Date(Math.max(...times));
  const ma = MONTHS[a.getUTCMonth()], mb = MONTHS[b.getUTCMonth()];
  const ya = a.getUTCFullYear(), yb = b.getUTCFullYear();
  if (ya === yb && a.getUTCMonth() === b.getUTCMonth()) {
    return a.getUTCDate() === b.getUTCDate() ? `${ma} ${a.getUTCDate()}, ${ya}` : `${ma} ${a.getUTCDate()}–${b.getUTCDate()}, ${ya}`;
  }
  if (ya === yb) return `${ma} ${a.getUTCDate()} – ${mb} ${b.getUTCDate()}, ${ya}`;
  return `${ma} ${ya} – ${mb} ${yb}`;
}

// ───────── plan ─────────
const PUNCHY: TransitionKind[] = ["whip", "zoom-through", "flash", "glitch", "push", "slide-left", "dissolve", "light-leak"];
const MOTION: ClipAnimation[] = [
  { in: "fade", emphasis: "ken-burns" },
  { in: "zoom-in", emphasis: "ken-burns-out" },
  { in: "fade", emphasis: "ken-burns-out" },
  { in: "pop", emphasis: "ken-burns" },
  { in: "slide-up", emphasis: "float" },
];
const VARIANTS = ["Classic", "Punchy", "Dreamy", "Fast cut"] as const;

export function breezePlan(items: BreezeItem[], opts: BreezeOptions): BreezePlan {
  const rnd = mulberry32(opts.seed || 1);
  const variant = VARIANTS[Math.abs((opts.seed || 1) - 1) % VARIANTS.length];
  const ordered = breezeOrder(items);
  const { kept: culled, dropped } = breezeCull(ordered);
  const maxClips = opts.maxClips ?? 20;
  let kept = culled;
  if (kept.length > maxClips) {
    // keep the sharpest, but preserve story order
    const rank = [...kept].sort((a, b) => (b.sharpness ?? 0) - (a.sharpness ?? 0)).slice(0, maxClips);
    const keep = new Set(rank);
    for (const k of kept) if (!keep.has(k)) dropped.push({ id: k.id, reason: "overflow" });
    kept = kept.filter((k) => keep.has(k));
  }
  const n = Math.max(1, kept.length);
  const beat = 60 / (opts.bpm > 0 ? opts.bpm : 100);
  const pace = variant === "Fast cut" ? 0.75 : variant === "Dreamy" ? 1.25 : 1;
  const target = opts.targetSec ?? Math.min(30, Math.max(15, Math.round(n * 2.6 * pace)));
  const txSec = variant === "Dreamy" ? 0.8 : variant === "Fast cut" ? 0.3 : 0.5;
  // starts on beats: (hold − tx) is a whole number of beats
  const stepBeats = Math.max(2, Math.round(target / n / beat));
  const step = stepBeats * beat;

  const clips: BreezeClip[] = kept.map((it, i) => {
    const last = i === n - 1;
    let hold = step + (last ? beat * 2 : txSec);
    let inSec: number | undefined;
    if (it.kind === "video" && it.sourceSec) {
      hold = Math.min(hold, it.sourceSec);
      if (it.sourceSec > hold + 0.5) inSec = Math.round(((it.sourceSec - hold) / 2) * 100) / 100;
    }
    let tx: TransitionKind | null = null;
    if (!last) {
      if (variant === "Classic") tx = i % 3 === 2 ? PUNCHY[Math.floor(rnd() * PUNCHY.length)] : opts.themeTransition;
      else if (variant === "Punchy" || variant === "Fast cut") tx = PUNCHY[Math.floor(rnd() * 5)];
      else tx = rnd() < 0.7 ? "dissolve" : "light-leak";
    }
    const base = opts.themeAnimation && variant === "Classic" && i % 2 === 0 ? opts.themeAnimation : MOTION[Math.floor(rnd() * MOTION.length)];
    const animation: ClipAnimation = {
      ...base,
      ...(variant === "Fast cut" ? { in: "pop" as const, inSec: 0.25 } : {}),
      ...(last ? { out: "fade" as const, outSec: 0.8 } : {}),
    };
    return {
      id: it.id,
      durationSec: Math.round(hold * 1000) / 1000,
      ...(inSec != null ? { inSec } : {}),
      transitionOut: tx,
      ...(tx ? { transitionSpec: { durationSec: txSec, easing: variant === "Punchy" ? "ease-out" : "ease-in-out" } } : {}),
      animation,
    } as BreezeClip;
  });
  const totalSec = Math.round((clips.reduce((s, c) => s + c.durationSec, 0) - clips.slice(0, -1).reduce((s, c) => s + (c.transitionOut ? txSec : 0), 0)) * 100) / 100;

  const times = kept.map((k) => k.takenAt).filter((t): t is number => t != null);
  const geo = kept.find((k) => k.lat != null && k.lon != null);
  const place = geo ? nearestPlace(geo.lat as number, geo.lon as number) : undefined;
  const dateLabel = dateRangeLabel(times);
  const multiDay = times.length > 1 && new Date(Math.min(...times)).toISOString().slice(0, 10) !== new Date(Math.max(...times)).toISOString().slice(0, 10);
  const titles = place
    ? [`${place}`, `${place} days`, `Hello, ${place}`, `${place} ✦ recap`]
    : multiDay
      ? ["The trip", "Days like these", "Our little adventure", "Recap"]
      : ["Today", "A good day", "Moments", "This one"];
  const title = titles[Math.abs((opts.seed || 1) - 1) % titles.length];
  const captions: BreezePlan["captions"] = [];
  if (opts.captions !== false && multiDay) {
    const day0 = Date.UTC(new Date(Math.min(...times)).getUTCFullYear(), new Date(Math.min(...times)).getUTCMonth(), new Date(Math.min(...times)).getUTCDate());
    let lastDay = 0;
    kept.forEach((k, i) => {
      if (k.takenAt == null) return;
      const day = Math.floor((k.takenAt - day0) / 86_400_000) + 1;
      if (day !== lastDay) {
        if (i > 0) captions.push({ clipIndex: i, text: `Day ${day}` });
        lastDay = day;
      }
    });
  }
  return { clips, dropped, totalSec, title, subtitle: dateLabel, place, dateLabel, captions, variant };
}

// ───────── EXIF (JPEG APP1) — capture time + GPS, no dependencies ─────────
export function parseExif(buf: ArrayBuffer): { takenAt?: number; lat?: number; lon?: number } {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {};
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    off += 2 + len;
  }
  return {};
}

function readTiff(v: DataView, t: number): { takenAt?: number; lat?: number; lon?: number } {
  try {
    const le = v.getUint16(t) === 0x4949;
    const u16 = (o: number) => v.getUint16(t + o, le);
    const u32 = (o: number) => v.getUint32(t + o, le);
    const ifd = (o: number) => {
      const out = new Map<number, { type: number; count: number; valOff: number }>();
      const n = u16(o);
      for (let i = 0; i < n; i++) {
        const e = o + 2 + i * 12;
        out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), valOff: e + 8 });
      }
      return out;
    };
    const ascii = (e: { count: number; valOff: number }) => {
      const at = e.count > 4 ? u32(e.valOff) : e.valOff;
      let s = "";
      for (let i = 0; i < e.count - 1; i++) s += String.fromCharCode(v.getUint8(t + at + i));
      return s;
    };
    const rationals = (e: { count: number; valOff: number }) => {
      const at = u32(e.valOff);
      const r: number[] = [];
      for (let i = 0; i < e.count; i++) r.push(u32(at + i * 8) / (u32(at + i * 8 + 4) || 1));
      return r;
    };
    const ifd0 = ifd(u32(4));
    const out: { takenAt?: number; lat?: number; lon?: number } = {};
    const exifPtr = ifd0.get(0x8769);
    const dt = (exifPtr && ifd(u32(exifPtr.valOff)).get(0x9003)) || ifd0.get(0x0132);
    if (dt) {
      const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(ascii(dt));
      if (m) out.takenAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    }
    const gpsPtr = ifd0.get(0x8825);
    if (gpsPtr) {
      const g = ifd(u32(gpsPtr.valOff));
      const la = g.get(2), lo = g.get(4), laR = g.get(1), loR = g.get(3);
      if (la && lo) {
        const dms = (r: number[]) => r[0] + (r[1] ?? 0) / 60 + (r[2] ?? 0) / 3600;
        let lat = dms(rationals(la)), lon = dms(rationals(lo));
        if (laR && String.fromCharCode(v.getUint8(t + laR.valOff)) === "S") lat = -lat;
        if (loR && String.fromCharCode(v.getUint8(t + loR.valOff)) === "W") lon = -lon;
        if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
          out.lat = lat;
          out.lon = lon;
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}
