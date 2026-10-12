/**
 * v1.1 "Story Brain" — everything on-device, no paid APIs:
 *  - EXIF GPS + capture time (tiny JPEG/TIFF parser)
 *  - smart crop focus point + quality score + near-duplicate hash (64px saliency pass)
 *  - best-shot picking, route (km, stops, nearest city from a bundled gazetteer)
 *  - prompt → story plan (theme, title, caption, language, pacing, keep N)
 */
import { PHRASES, detectScript, type Lang, type Mood } from "./i18n";

export type ClipBrain = { lat?: number; lon?: number; takenAt?: string; fx?: number; fy?: number; score?: number; hash?: string };

// ───────── EXIF ─────────
export function parseExif(buf: ArrayBuffer): Pick<ClipBrain, "lat" | "lon" | "takenAt"> {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {};
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    off += 2 + len;
  }
  return {};
}
function parseTiff(v: DataView, t: number): Pick<ClipBrain, "lat" | "lon" | "takenAt"> {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o: number) => v.getUint16(t + o, le), u32 = (o: number) => v.getUint32(t + o, le);
  const out: Pick<ClipBrain, "lat" | "lon" | "takenAt"> = {};
  const readIfd = (o: number) => {
    const n = u16(o);
    const tags: Record<number, { type: number; count: number; val: number }> = {};
    for (let i = 0; i < n && o + 2 + i * 12 + 12 <= v.byteLength - t; i++) {
      const e = o + 2 + i * 12;
      tags[u16(e)] = { type: u16(e + 2), count: u32(e + 4), val: e + 8 };
    }
    return tags;
  };
  const ascii = (tag: { count: number; val: number }) => {
    const p = tag.count > 4 ? u32(tag.val) : tag.val;
    let s = "";
    for (let i = 0; i < tag.count - 1; i++) s += String.fromCharCode(v.getUint8(t + p + i));
    return s;
  };
  const rationals = (tag: { val: number }) => {
    const p = u32(tag.val);
    return [0, 1, 2].map((i) => u32(p + i * 8) / (u32(p + i * 8 + 4) || 1));
  };
  try {
    const ifd0 = readIfd(u32(4));
    if (ifd0[0x8769]) {
      const ex = readIfd(u32(ifd0[0x8769].val));
      const dt = ex[0x9003] ?? ex[0x9004];
      if (dt) {
        const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(ascii(dt));
        if (m) out.takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
      }
    }
    if (ifd0[0x8825]) {
      const g = readIfd(u32(ifd0[0x8825].val));
      if (g[2] && g[4]) {
        const dms = (r: number[]) => r[0] + r[1] / 60 + r[2] / 3600;
        const latRef = g[1] ? String.fromCharCode(v.getUint8(t + g[1].val)) : "N";
        const lonRef = g[3] ? String.fromCharCode(v.getUint8(t + g[3].val)) : "E";
        const lat = dms(rationals(g[2])) * (latRef === "S" ? -1 : 1);
        const lon = dms(rationals(g[4])) * (lonRef === "W" ? -1 : 1);
        if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) {
          out.lat = +lat.toFixed(5);
          out.lon = +lon.toFixed(5);
        }
      }
    }
  } catch {
    /* malformed EXIF */
  }
  return out;
}

// ───────── pixels: smart crop focus, quality, dHash ─────────
export async function analyzePixels(src: Blob | string): Promise<Pick<ClipBrain, "fx" | "fy" | "score" | "hash">> {
  try {
    const bmp = await createImageBitmap(typeof src === "string" ? await (await fetch(src)).blob() : src);
    const W = 64, H = Math.max(8, Math.round((64 * bmp.height) / bmp.width));
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0, W, H);
    bmp.close?.();
    const d = x.getImageData(0, 0, W, H).data;
    const L = new Float32Array(W * H);
    let sum = 0, satSum = 0;
    const sal = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      L[i] = l; sum += l;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0;
      satSum += sat;
      // skin-ish tones get a boost (faces are usually the subject)
      const skin = r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15 ? 0.6 : 0;
      sal[i] = sat * 0.5 + skin;
    }
    let lap = 0, lapN = 0;
    for (let y = 1; y < H - 1; y++)
      for (let xx = 1; xx < W - 1; xx++) {
        const i = y * W + xx;
        const e = Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - W] - L[i + W]);
        lap += e * e; lapN++;
        sal[i] += e / 64;
      }
    // focus = saliency centroid, pulled gently toward centre
    let sx = 0, sy = 0, sw = 0;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const w = sal[y * W + xx] ** 2; sx += w * xx; sy += w * y; sw += w; }
    const fx = sw ? 0.5 + ((sx / sw) / (W - 1) - 0.5) * 0.85 : 0.5;
    const fy = sw ? 0.5 + ((sy / sw) / (H - 1) - 0.5) * 0.85 : 0.5;
    const mean = sum / (W * H);
    const sharp = Math.min(1, Math.sqrt(lap / Math.max(1, lapN)) / 40);
    const exposure = 1 - Math.min(1, Math.abs(mean - 125) / 125);
    const color = Math.min(1, (satSum / (W * H)) * 2.2);
    const score = +(0.5 * sharp + 0.3 * exposure + 0.2 * color).toFixed(3);
    // 8x8 difference hash
    const h = document.createElement("canvas"); h.width = 9; h.height = 8;
    const hx = h.getContext("2d", { willReadFrequently: true })!;
    hx.drawImage(c, 0, 0, 9, 8);
    const hd = hx.getImageData(0, 0, 9, 8).data;
    let bits = "";
    for (let y = 0; y < 8; y++) for (let xx = 0; xx < 8; xx++) { const a = y * 9 + xx; bits += hd[a * 4] + hd[a * 4 + 1] > hd[(a + 1) * 4] + hd[(a + 1) * 4 + 1] ? "1" : "0"; }
    const hash = BigInt("0b" + bits).toString(16).padStart(16, "0");
    return { fx: +fx.toFixed(3), fy: +fy.toFixed(3), score, hash };
  } catch {
    return {};
  }
}

export async function analyzeFile(file: File): Promise<ClipBrain> {
  const out: ClipBrain = {};
  if (/jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name)) Object.assign(out, parseExif(await file.slice(0, 256 * 1024).arrayBuffer()));
  if (!out.takenAt && file.lastModified) out.takenAt = new Date(file.lastModified).toISOString().slice(0, 19);
  if (file.type.startsWith("image/")) Object.assign(out, await analyzePixels(file));
  return out;
}

const ham = (a?: string, b?: string) => {
  if (!a || !b) return 64;
  let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
};

type BrainClip = { id: string; kind: string; brain?: ClipBrain };
/** Best shots: drop near-duplicates (keep the better twin), then keep the top N by score. Order preserved. */
export function pickBest<T extends BrainClip>(clips: T[], keep?: number): { kept: T[]; dropped: T[] } {
  const byScore = [...clips].sort((a, b) => (b.brain?.score ?? 0.5) - (a.brain?.score ?? 0.5));
  const chosen: T[] = [];
  for (const c of byScore) {
    if (c.kind === "image" && chosen.some((k) => k.kind === "image" && ham(k.brain?.hash, c.brain?.hash) <= 5)) continue;
    chosen.push(c);
  }
  const cap = keep && keep > 0 ? chosen.slice(0, keep) : chosen;
  const ids = new Set(cap.map((c) => c.id));
  return { kept: clips.filter((c) => ids.has(c.id)), dropped: clips.filter((c) => !ids.has(c.id)) };
}

// ───────── route ─────────
const CITIES: [string, number, number][] = [
  ["Mumbai", 19.076, 72.8777], ["Delhi", 28.6139, 77.209], ["Bengaluru", 12.9716, 77.5946], ["Hyderabad", 17.385, 78.4867], ["Chennai", 13.0827, 80.2707],
  ["Kolkata", 22.5726, 88.3639], ["Pune", 18.5204, 73.8567], ["Ahmedabad", 23.0225, 72.5714], ["Jaipur", 26.9124, 75.7873], ["Goa", 15.4909, 73.8278],
  ["Kochi", 9.9312, 76.2673], ["Udaipur", 24.5854, 73.7125], ["Agra", 27.1767, 78.0081], ["Varanasi", 25.3176, 82.9739], ["Rishikesh", 30.0869, 78.2676],
  ["Manali", 32.2432, 77.1892], ["Leh", 34.1526, 77.5771], ["Shimla", 31.1048, 77.1734], ["Mysuru", 12.2958, 76.6394], ["Ooty", 11.4102, 76.695],
  ["Visakhapatnam", 17.6868, 83.2185], ["Vijayawada", 16.5062, 80.648], ["Tirupati", 13.6288, 79.4192], ["Madurai", 9.9252, 78.1198], ["Pondicherry", 11.9416, 79.8083],
  ["Munnar", 10.0889, 77.0595], ["Alleppey", 9.4981, 76.3388], ["Amritsar", 31.634, 74.8723], ["Chandigarh", 30.7333, 76.7794], ["Darjeeling", 27.041, 88.2663],
  ["Gangtok", 27.3389, 88.6065], ["Hampi", 15.335, 76.46], ["Coorg", 12.3375, 75.8069], ["Lucknow", 26.8467, 80.9462], ["Srinagar", 34.0837, 74.7973],
  ["Dubai", 25.2048, 55.2708], ["Singapore", 1.3521, 103.8198], ["Bangkok", 13.7563, 100.5018], ["Bali", -8.4095, 115.1889], ["Kathmandu", 27.7172, 85.324],
  ["Colombo", 6.9271, 79.8612], ["London", 51.5072, -0.1276], ["Paris", 48.8566, 2.3522], ["Rome", 41.9028, 12.4964], ["Barcelona", 41.3874, 2.1686],
  ["Amsterdam", 52.3676, 4.9041], ["Zurich", 47.3769, 8.5417], ["Istanbul", 41.0082, 28.9784], ["Tokyo", 35.6762, 139.6503], ["Seoul", 37.5665, 126.978],
  ["Sydney", -33.8688, 151.2093], ["New York", 40.7128, -74.006], ["San Francisco", 37.7749, -122.4194], ["Los Angeles", 34.0522, -118.2437], ["Seattle", 47.6062, -122.3321],
  ["Chicago", 41.8781, -87.6298], ["Toronto", 43.6532, -79.3832], ["Vancouver", 49.2827, -123.1207], ["Cancún", 21.1619, -86.8515], ["Cape Town", -33.9249, 18.4241],
];
export const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export function nearestPlace(p: { lat: number; lon: number }, maxKm = 80): string | null {
  let best: string | null = null, bd = maxKm;
  for (const [n, lat, lon] of CITIES) { const d = haversineKm(p, { lat, lon }); if (d < bd) { bd = d; best = n; } }
  return best;
}
export type RoutePoint = { lat: number; lon: number; label?: string | null };
export type Route = { points: RoutePoint[]; km: number; stops: string[]; from?: string; to?: string; days: number };
/** GPS points in capture order, merged when < 2 km apart. */
export function buildRoute(clips: { brain?: ClipBrain }[]): Route | null {
  const pts = clips
    .map((c) => c.brain)
    .filter((b): b is ClipBrain & { lat: number; lon: number } => b?.lat != null && b?.lon != null)
    .sort((a, b) => (a.takenAt ?? "").localeCompare(b.takenAt ?? ""));
  const merged: RoutePoint[] = [];
  for (const p of pts) if (!merged.length || haversineKm(merged[merged.length - 1], p) > 2) merged.push({ lat: p.lat, lon: p.lon, label: nearestPlace(p) });
  if (merged.length < 2) return null;
  let km = 0;
  for (let i = 1; i < merged.length; i++) km += haversineKm(merged[i - 1], merged[i]);
  const stops = [...new Set(merged.map((m) => m.label).filter(Boolean) as string[])];
  const dates = new Set(pts.map((p) => (p.takenAt ?? "").slice(0, 10)).filter(Boolean));
  return { points: merged, km: Math.round(km), stops, from: stops[0], to: stops[stops.length - 1], days: dates.size };
}

// ───────── prompt → story ─────────
const MOODS: [Mood, RegExp, string][] = [
  ["party", /party|birthday|bday|night ?out|club|dance|celebrat|पार्टी|జన్మదిన|பிறந்த/i, "theme.party-strobe"],
  ["wedding", /wedding|shaadi|shadi|marriage|engage|sangeet|mehendi|haldi|शादी|పెళ్లి|திருமண/i, "theme.rose-quartz"],
  ["food", /food|eat|cafe|restaurant|brunch|street food|खाना|భోజన|உணவு/i, "theme.golden-hour"],
  ["family", /family|kids|mom|dad|amma|nana|nani|parents|परिवार|కుటుంబ|குடும்ப/i, "theme.soft-film"],
  ["calm", /calm|slow|peace|chill|sunset|monsoon|rain|सुकून|ప్రశాంత/i, "theme.documentary-grain"],
  ["trip", /trip|travel|road|beach|mountain|trek|vacation|holiday|tour|journey|safar|yatra|सफ़र|यात्रा|ప్రయాణ|பயண/i, "theme.ocean-pop"],
];
const LANG_WORDS: [RegExp, Lang][] = [
  [/\bhindi\b/i, "hi"], [/\btelugu\b/i, "te"], [/\btamil\b/i, "ta"], [/\bkannada\b/i, "kn"], [/\bmalayalam\b/i, "ml"],
  [/\bbengali|bangla\b/i, "bn"], [/\bmarathi\b/i, "mr"], [/\bgujarati\b/i, "gu"], [/\bpunjabi\b/i, "pa"], [/\benglish\b/i, "en"],
];
export type StoryPlan = {
  mood: Mood; themeId: string; title: string; caption: string; lang: Lang;
  pace: "fast" | "normal" | "slow"; secPerPhoto: number; keep?: number; order: "time" | "best" | "as-is"; routeIntro: boolean; place?: string;
};
export function planFromPrompt(prompt: string, ctx: { route?: Route | null; fallbackLang?: Lang } = {}): StoryPlan {
  const p = prompt.trim();
  const moodHit = MOODS.find(([, re]) => re.test(p));
  const mood: Mood = moodHit?.[0] ?? (ctx.route ? "trip" : "default");
  const themeId = moodHit?.[2] ?? (mood === "trip" ? "theme.ocean-pop" : "theme.golden-hour");
  const lang: Lang = LANG_WORDS.find(([re]) => re.test(p))?.[1] ?? detectScript(p) ?? ctx.fallbackLang ?? "en";
  const pace = /fast|quick|hype|energetic|reel|short|तेज़/i.test(p) ? "fast" : /slow|cinematic|calm|long|dreamy|धीरे/i.test(p) ? "slow" : "normal";
  const keepM = /(?:best|top|only|keep)\s+(\d{1,2})/i.exec(p) ?? /(\d{1,2})\s+(?:best|photos|shots|pics)/i.exec(p);
  const keep = keepM ? Math.max(2, Math.min(40, +keepM[1])) : /best|highlights|top shots/i.test(p) ? 10 : undefined;
  const quoted = /["“'‘]([^"”'’]{2,60})["”'’]/.exec(p)?.[1];
  const placeM = /\b(?:to|in|at|from)\s+([A-Z][\p{L}]+(?:\s[A-Z][\p{L}]+)?)/u.exec(p)?.[1];
  const place = placeM || ctx.route?.to || ctx.route?.from || undefined;
  const phr = PHRASES[lang][mood];
  const fill = (s: string) => s.replace("{place}", place ?? "").replace(/^\s*(की|ని|ની|ਦੀਆਂ|ਦਾ|का|ची|ના)\s+/u, "").trim();
  const title = quoted ?? (place || !phr.title.includes("{place}") ? fill(phr.title) : fill(PHRASES[lang].default.title));
  return {
    mood, themeId, lang, pace, keep, place,
    title,
    caption: phr.caption,
    secPerPhoto: pace === "fast" ? 1.4 : pace === "slow" ? 3.6 : 2.4,
    order: /as is|my order|keep order/i.test(p) ? "as-is" : /best first/i.test(p) ? "best" : "time",
    routeIntro: !!ctx.route && !/no map|without map/i.test(p),
  };
}
