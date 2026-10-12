/** v1.1 "Year in Voyages": a Wrapped-style recap from this device's voyages (nothing leaves the phone). */
import { listShares, type ShareRecord } from "./shareStore";
import { buildRoute, nearestPlace, type ClipBrain, type Route } from "./storyBrain";

export type YearRecap = {
  year: number; stories: number; photos: number; videos: number; minutes: number;
  places: string[]; days: number; route: Route | null; topTheme: { name: string; gradient: string; n: number } | null;
  bestClipId: string | null; firstTitle: string | null; invites: number;
};

export function computeYear(year = new Date().getFullYear(), shares: ShareRecord[] = listShares()): YearRecap {
  const mine = shares.filter((s) => new Date(s.createdAt).getFullYear() === year);
  const clips = mine.flatMap((s) => s.playback?.clips ?? []);
  const brains = clips.map((c) => c.brain).filter(Boolean) as ClipBrain[];
  const themes = new Map<string, { name: string; gradient: string; n: number }>();
  for (const s of mine) {
    const t = themes.get(s.themeId) ?? { name: s.themeName, gradient: s.themeGradient, n: 0 };
    t.n++;
    themes.set(s.themeId, t);
  }
  const places = [...new Set(brains.filter((b) => b.lat != null).map((b) => nearestPlace({ lat: b.lat!, lon: b.lon! }, 120)).filter(Boolean) as string[])];
  const days = new Set(brains.map((b) => b.takenAt?.slice(0, 10)).filter((d) => d && d.startsWith(String(year)))).size;
  const best = clips.filter((c) => c.kind === "image").sort((a, b) => (b.brain?.score ?? 0) - (a.brain?.score ?? 0))[0];
  return {
    year,
    stories: mine.filter((s) => s.mode !== "invitation").length,
    invites: mine.filter((s) => s.mode === "invitation").length,
    photos: clips.filter((c) => c.kind === "image").length,
    videos: clips.filter((c) => c.kind === "video").length,
    minutes: Math.round(mine.reduce((n, s) => n + (s.durationSec || 0), 0) / 6) / 10,
    places,
    days,
    route: buildRoute(clips),
    topTheme: [...themes.values()].sort((a, b) => b.n - a.n)[0] ?? null,
    bestClipId: best?.id ?? null,
    firstTitle: [...mine].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.title ?? null,
  };
}

/** 1080×1920 share card. */
export async function renderYearCard(r: YearRecap, photo?: Blob | null): Promise<Blob> {
  const W = 1080, H = 1920;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#ff4d8d"); g.addColorStop(0.5, "#7c5cff"); g.addColorStop(1, "#00d1ff");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  if (photo) {
    try {
      const b = await createImageBitmap(photo);
      const s = Math.max(W / b.width, 900 / b.height);
      x.save(); x.beginPath(); x.roundRect(80, 520, W - 160, 760, 48); x.clip();
      x.drawImage(b, (W - b.width * s) / 2, 520 + (760 - b.height * s) / 2, b.width * s, b.height * s);
      x.restore();
    } catch { /* no photo */ }
  }
  x.fillStyle = "#fff"; x.textAlign = "center";
  x.font = "800 220px Sora, Inter, sans-serif"; x.fillText(String(r.year), W / 2, 300);
  x.font = "700 64px Sora, Inter, sans-serif"; x.fillText("in Voyages", W / 2, 400);
  const stats: [string, string][] = [[String(r.stories + r.invites), "stories"], [String(r.photos), "photos"], [String(r.places.length || r.days), r.places.length ? "places" : "days"]];
  stats.forEach(([n, l], i) => {
    const cx = W / 2 + (i - 1) * 320;
    x.font = "800 120px Sora, Inter, sans-serif"; x.fillText(n, cx, 1480);
    x.font = "600 44px Inter, sans-serif"; x.fillText(l, cx, 1550);
  });
  if (r.route) { x.font = "700 56px Sora, Inter, sans-serif"; x.fillText(`${r.route.km.toLocaleString()} km travelled`, W / 2, 1680); }
  x.font = "600 40px Inter, sans-serif"; x.globalAlpha = 0.85; x.fillText("made with Voyajes · free, no watermark", W / 2, 1840);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/png"));
}
