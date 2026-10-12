// v0.9 "One Link" printables + previews, rendered client-side with the theme look:
//  - 1200×630 cover JPG (og:image for WhatsApp/iMessage/Slack previews)
//  - QR invite cards: A6 / 5×7 print (PDF + PNG) and a phone-size PNG
//  - "Drop your photos" table card
import { fxOps, getLook, lookGradeCss, type ThemeLook } from "@voyajes/core";
import qrcode from "qrcode-generator";
import { drawFxOps } from "./themeFx";
import { fmtWhen, type Invitation } from "@voyajes/core";
import type { PortablePackV1 } from "./portableShare";

export type CardFormat = "a6" | "5x7" | "phone" | "table";
export const CARD_FORMATS: Record<CardFormat, { label: string; w: number; h: number; pt: [number, number] | null }> = {
  a6: { label: "A6 print", w: 1240, h: 1748, pt: [297.64, 419.53] },
  "5x7": { label: "5×7 in print", w: 1500, h: 2100, pt: [360, 504] },
  phone: { label: "Phone (9:16)", w: 1080, h: 1920, pt: null },
  table: { label: "Table card · photo drop", w: 1240, h: 1748, pt: [297.64, 419.53] },
};

export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** QR with a 4-module quiet zone on a white rounded tile (scanners need contrast). */
export function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const m = qrMatrix(text);
  const n = m.length + 8;
  const cell = Math.floor(size / n);
  const real = cell * n;
  const ox = Math.round(x + (size - real) / 2), oy = Math.round(y + (size - real) / 2);
  ctx.save();
  ctx.fillStyle = "#fff";
  roundRect(ctx, ox - cell, oy - cell, real + cell * 2, real + cell * 2, cell * 2);
  ctx.fill();
  ctx.fillStyle = "#0B0D12";
  m.forEach((row, r) => row.forEach((d, c) => d && ctx.fillRect(ox + (c + 4) * cell, oy + (r + 4) * cell, cell, cell)));
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function loadImg(url: string | undefined | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((res) => {
    const img = new Image();
    if (!url.startsWith("data:") && !url.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

/** Themed backdrop: user's photo (cover-fit, graded) or the look's gradient, plus the look's FX. */
function paintBackdrop(ctx: CanvasRenderingContext2D, look: ThemeLook, w: number, h: number, img: HTMLImageElement | null, intensity = 0.7, photoBox?: { x: number; y: number; w: number; h: number }) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, look.bg[0]);
  g.addColorStop(0.6, look.bg[1]);
  g.addColorStop(1, look.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (img) {
    const b = photoBox ?? { x: 0, y: 0, w, h };
    const s = Math.max(b.w / img.naturalWidth, b.h / img.naturalHeight);
    const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    try {
      ctx.filter = lookGradeCss(look, intensity);
    } catch {
      /* old Safari */
    }
    ctx.drawImage(img, b.x + (b.w - iw) / 2, b.y + (b.h - ih) / 2, iw, ih);
    ctx.filter = "none";
    ctx.restore();
  }
  try {
    drawFxOps(ctx, fxOps(look, intensity, 1.2, w, h), w, h);
  } catch {
    /* fx are decoration */
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 800, family = "Sora, system-ui, sans-serif"): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 12 && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function shade(ctx: CanvasRenderingContext2D, w: number, y0: number, y1: number, alpha = 0.75) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, w, y1 - y0);
}

export type CardInfo = {
  themeId?: string;
  intensity?: number;
  imageUrl?: string | null;
  title: string;
  /** e.g. "Asha invites you" */
  kicker?: string;
  /** detail lines: when, where, RSVP by … */
  lines?: string[];
  url: string;
};

/** 1200×630 link-preview cover. */
export async function renderCover(info: Omit<CardInfo, "url"> & { url?: string }): Promise<Blob> {
  const look = getLook(info.themeId);
  const w = 1200, h = 630;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  paintBackdrop(ctx, look, w, h, await loadImg(info.imageUrl), info.intensity);
  shade(ctx, w, h * 0.3, h, 0.82);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,.5)";
  ctx.shadowBlur = 18;
  if (info.kicker) {
    fitText(ctx, info.kicker.toUpperCase(), w - 120, 30, 700);
    ctx.fillStyle = look.accent;
    ctx.fillText(info.kicker.toUpperCase(), 60, h - 210);
  }
  ctx.fillStyle = "#fff";
  fitText(ctx, info.title, w - 120, 78);
  ctx.fillText(info.title, 60, h - 130);
  const sub = (info.lines ?? []).filter(Boolean).join("  ·  ");
  if (sub) {
    fitText(ctx, sub, w - 120, 32, 600);
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.fillText(sub, 60, h - 76);
  }
  ctx.shadowBlur = 0;
  ctx.font = "700 24px Sora, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.textAlign = "right";
  ctx.fillText(`${look.emoji} voyajes`, w - 40, 50);
  return toBlob(c, "image/jpeg", 0.86);
}

/** Printable / phone QR card. */
export async function renderCard(format: CardFormat, info: CardInfo): Promise<HTMLCanvasElement> {
  const f = CARD_FORMATS[format];
  const { w, h } = f;
  const look = getLook(info.themeId);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = await loadImg(info.imageUrl);
  const photoH = Math.round(h * (format === "table" ? 0.34 : 0.46));
  paintBackdrop(ctx, look, w, h, img, info.intensity, { x: 0, y: 0, w, h: photoH });
  shade(ctx, w, photoH * 0.45, photoH, 0.7);
  const pad = Math.round(w * 0.07);
  const u = w / 1000;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 16 * u;
  const table = format === "table";
  const kicker = table ? "📸 Share your photos" : info.kicker || "You're invited";
  fitText(ctx, kicker.toUpperCase(), w - pad * 2, 42 * u, 700);
  ctx.fillStyle = look.accent;
  ctx.fillText(kicker.toUpperCase(), w / 2, photoH - 150 * u);
  ctx.fillStyle = "#fff";
  fitText(ctx, info.title, w - pad * 2, 96 * u);
  ctx.fillText(info.title, w / 2, photoH - 50 * u);
  ctx.shadowBlur = 0;
  let y = photoH + 80 * u;
  const lines = table
    ? ["Scan → add your photos & videos", "They'll appear in the after-movie"]
    : (info.lines ?? []).filter(Boolean);
  for (const line of lines.slice(0, 4)) {
    fitText(ctx, line, w - pad * 2, 44 * u, 600);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillText(line, w / 2, y);
    y += 62 * u;
  }
  const qrSize = Math.min(w * 0.5, h - y - 200 * u);
  const qrY = y + 20 * u;
  drawQr(ctx, info.url, (w - qrSize) / 2, qrY, qrSize);
  ctx.fillStyle = "rgba(255,255,255,.85)";
  fitText(ctx, table ? "Scan with your phone camera" : "Scan to watch & RSVP", w - pad * 2, 36 * u, 700);
  ctx.fillText(table ? "Scan with your phone camera" : "Scan to watch & RSVP", w / 2, qrY + qrSize + 70 * u);
  const short = info.url.replace(/^https?:\/\//, "");
  fitText(ctx, short, w - pad * 2, 28 * u, 500, "ui-monospace, Menlo, monospace");
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillText(short, w / 2, qrY + qrSize + 118 * u);
  return c;
}

export const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Canvas export failed"))), type, q));

/** Minimal single-page PDF embedding a JPEG at the exact print size (no dependency). */
export async function canvasToPdf(c: HTMLCanvasElement, pt: [number, number]): Promise<Blob> {
  const jpg = new Uint8Array(await (await toBlob(c, "image/jpeg", 0.92)).arrayBuffer());
  const [pw, ph] = pt.map((n) => n.toFixed(2));
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? enc.encode(b) : b;
    parts.push(u);
    len += u.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = len;
    push(`${n} 0 obj\n`);
    if (typeof body === "string") push(body);
    else body();
    push("\nendobj\n");
  };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
    push(jpg);
    push("\nendstream");
  });
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/** Card/cover details straight from a published pack. */
export function cardInfoFromPack(pack: PortablePackV1, url: string): CardInfo {
  const pb = pack.share.playback;
  const inv = (pb?.invitation ?? pack.share.invitation) as Invitation | undefined;
  const clips = pb?.clips ?? [];
  let imageUrl: string | null = null;
  for (const c of clips) {
    const m = pack.media[c.id];
    if (m && m.kind === "image" && (m.url || m.dataUrl)) {
      imageUrl = m.url || m.dataUrl;
      break;
    }
  }
  const isInvite = pack.share.mode === "invitation";
  const lines: string[] = [];
  if (inv) {
    const when = fmtWhen(inv);
    if (when) lines.push(`📅 ${when}`);
    if (inv.eventWhere) lines.push(`📍 ${inv.eventWhere}`);
    if (inv.rsvpDeadline) {
      const d = new Date(inv.rsvpDeadline);
      if (!isNaN(+d)) lines.push(`RSVP by ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
    }
  }
  return {
    themeId: pb?.themeId ?? pack.share.themeId,
    intensity: pb?.themeIntensity,
    imageUrl,
    title: (inv?.eventName || pack.share.title || "Voyajes").slice(0, 60),
    kicker: isInvite ? (inv?.hostName ? `${inv.hostName} invites you` : "You're invited") : "Watch the story",
    lines: isInvite ? lines : [`${clips.length} moments`],
    url,
  };
}
