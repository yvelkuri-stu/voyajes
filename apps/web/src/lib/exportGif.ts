/**
 * Browser-side slideshow → animated GIF (and optional animated WebP) via canvas + gifenc.
 * Caps resolution / fps / duration for chat-friendly file sizes. Reuses the same visual
 * pipeline ideas as exportWebm (cover fit, Ken Burns, theme grade, text, invite cards).
 */

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type {
  Aspect,
  InvitationMeta,
  ProjectMode,
  TextPosition,
  TextStyle,
  TextTransition,
  TransitionKind,
} from "@voyajes/core";
import type { ThemeCard } from "../data/themes";
import { assetUrl } from "./assetUrl";
import { buildInviteCardLines } from "./inviteCard";
import {
  canvasSizeForAspect,
  type ExportClip,
  type ExportProgress,
  type ExportTextOverlay,
  type ExportTimelineOptions,
  drawClipLayer,
} from "./exportWebm";
import { framesAt, sourceTimeAt } from "@voyajes/core";
import { computeLayout } from "./timelineRender";
import { applyTransformToCanvas, ease, gradeFilter, layerTransformAt } from "@voyajes/core";
import { transitionEasingInto, transitionSecInto } from "./timelineRender";

/** Soft caps — HQ as practical while keeping chat-friendly sizes */
export const GIF_EXPORT_DEFAULTS = {
  /** Max canvas width (px). Height follows aspect. 720 ≈ “720p width”; 480 smaller. */
  maxWidth: 720,
  fps: 10,
  /** Trim long voyages so GIF stays shareable */
  maxDurationSec: 12,
  /** Colors per frame palette */
  maxColors: 128,
} as const;

export const GIF_SIZE_HINT =
  "GIF · up to 720px wide · ~10 fps · first ~12s · often a few MB (smaller than video; great for WhatsApp)";

export type ExportGifFormat = "gif" | "webp";

export type ExportGifOptions = {
  clips: ExportClip[];
  theme: ThemeCard;
  title: string;
  aspect: Aspect;
  transition?: TransitionKind;
  textOverlays?: ExportTextOverlay[];
  captionText?: string;
  captionStyle?: TextStyle;
  textStyle?: TextStyle;
  watermark?: boolean;
  burnTitle?: boolean;
  mode?: ProjectMode;
  invitation?: InvitationMeta;
  /** Cap width (default 720). Use 480 for smaller files. */
  maxWidth?: number;
  fps?: number;
  maxDurationSec?: number;
  maxColors?: number;
  /**
   * Prefer "gif". "webp" tries animated WebP when the browser can encode it;
   * falls back to GIF if not.
   */
  preferFormat?: ExportGifFormat;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
} & ExportTimelineOptions;

export type ExportGifResult = {
  blob: Blob;
  mimeType: string;
  extension: "gif" | "webp";
  width: number;
  height: number;
  durationSec: number;
  frameCount: number;
  trimmed: boolean;
  skippedVideos: string[];
  /** Human-readable size guidance used in the UI */
  sizeNote: string;
};

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Export cancelled", "AbortError");
  }
}

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    const onAbort = () => {
      img.src = "";
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    img.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve(img);
    };
    img.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Failed to load image for GIF export"));
    };
    img.src = url;
  });
}

function waitVideoReady(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Export cancelled", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    if (video.readyState >= 2) {
      done();
      return;
    }
    video.onloadeddata = () => done();
    video.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Failed to load video for GIF export"));
    };
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  cw: number,
  ch: number,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
) {
  const srcRatio = sw / sh;
  const dstRatio = cw / ch;
  let dw: number;
  let dh: number;
  if (srcRatio > dstRatio) {
    dh = ch * scale;
    dw = dh * srcRatio;
  } else {
    dw = cw * scale;
    dh = dw / srcRatio;
  }
  const dx = (cw - dw) / 2 + offsetX * cw;
  const dy = (ch - dh) / 2 + offsetY * ch;
  ctx.drawImage(source, dx, dy, dw, dh);
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function fillThemeGrade(
  ctx: CanvasRenderingContext2D,
  theme: ThemeCard,
  w: number,
  h: number,
  opacity = 0.45,
) {
  const stops = theme.gradient.match(/#[0-9a-fA-F]{6}/g) ?? [
    theme.palette.bg,
    theme.palette.accent,
  ];
  const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
  stops.forEach((c, i) => {
    g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c);
  });
  ctx.save();
  ctx.globalAlpha = opacity;
  try {
    ctx.globalCompositeOperation = "soft-light";
  } catch {
    ctx.globalCompositeOperation = "overlay";
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function fillVignette(
  ctx: CanvasRenderingContext2D,
  theme: ThemeCard,
  w: number,
  h: number,
  opacity = 0.7,
) {
  const rgb = parseHex(theme.palette.bg) ?? { r: 11, g: 13, b: 18 };
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.2,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.72,
  );
  g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
  g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0.85)`);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function fontForStyle(style: TextStyle | undefined, size: number): string {
  switch (style) {
    case "bold-impact":
      return `800 ${size}px Sora, system-ui, sans-serif`;
    case "soft-serif":
      return `600 ${size}px Georgia, "Times New Roman", serif`;
    case "script-soft":
      return `500 ${size}px "Segoe Script", "Apple Chancery", cursive`;
    case "mono-tech":
      return `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    case "vintage-poster":
    case "kinetic-outline":
      return `800 ${size}px Sora, system-ui, sans-serif`;
    case "caption-pill":
    case "clean-sans":
    default:
      return `600 ${size}px Inter, system-ui, sans-serif`;
  }
}

function positionY(
  position: TextPosition | undefined,
  h: number,
  pad: number,
): { y: number; baseline: CanvasTextBaseline } {
  switch (position) {
    case "top":
      return { y: pad + 8, baseline: "top" };
    case "center":
      return { y: h / 2, baseline: "middle" };
    case "lower-third":
      return { y: h * 0.72, baseline: "top" };
    case "bottom":
    default:
      return { y: h - pad, baseline: "bottom" };
  }
}

function animAlpha(
  localT: number,
  durationSec: number,
  animationIn?: TextTransition,
  animationOut?: TextTransition,
): number {
  const inDur = 0.35;
  const outDur = 0.3;
  let a = 1;
  if (animationIn && localT < inDur) a = Math.min(a, localT / inDur);
  if (animationOut && durationSec - localT < outDur) {
    a = Math.min(a, Math.max(0, (durationSec - localT) / outDur));
  }
  return Math.max(0, Math.min(1, a));
}

function drawStyledText(
  ctx: CanvasRenderingContext2D,
  text: string,
  theme: ThemeCard,
  w: number,
  h: number,
  opts: {
    style?: TextStyle;
    color?: string;
    position?: TextPosition;
    role?: "title" | "subtitle" | "caption";
    alpha?: number;
  },
) {
  const pad = Math.round(w * 0.06);
  const isTitle = opts.role === "title";
  const size = Math.max(isTitle ? 18 : 12, Math.round(w * (isTitle ? 0.055 : 0.038)));
  const { y, baseline } = positionY(opts.position, h, pad);
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.fillStyle = opts.color || theme.palette.text;
  ctx.textAlign = opts.position === "center" ? "center" : "left";
  ctx.textBaseline = baseline;
  ctx.font = fontForStyle(opts.style, size);
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 10;
  const x = opts.position === "center" ? w / 2 : pad;
  const maxW = w - pad * 2;
  if (opts.style === "caption-pill") {
    const metrics = ctx.measureText(text.slice(0, 64));
    const tw = Math.min(metrics.width, maxW) + 20;
    const th = size * 1.4;
    const bx = opts.position === "center" ? x - tw / 2 : x - 10;
    const by =
      baseline === "bottom" ? y - th : baseline === "middle" ? y - th / 2 : y - 4;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    const r = th / 2;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + tw, by, bx + tw, by + th, r);
    ctx.arcTo(bx + tw, by + th, bx, by + th, r);
    ctx.arcTo(bx, by + th, bx, by, r);
    ctx.arcTo(bx, by, bx + tw, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = opts.color || theme.palette.text;
  }
  if (opts.style === "kinetic-outline") {
    ctx.strokeStyle = opts.color || theme.palette.text;
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.strokeText(text.slice(0, 64), x, y, maxW);
    ctx.fillStyle = "transparent";
  }
  ctx.fillText(text.slice(0, 64), x, y, maxW);
  ctx.restore();
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  theme: ThemeCard,
  w: number,
  h: number,
  style?: TextStyle,
) {
  drawStyledText(ctx, title, theme, w, h, {
    style: style ?? "clean-sans",
    position: "bottom",
    role: "title",
    color: theme.palette.text,
  });
}

function drawInviteCard(
  ctx: CanvasRenderingContext2D,
  theme: ThemeCard,
  w: number,
  h: number,
  kind: "intro" | "end",
  invitation: InvitationMeta | undefined,
  titleFallback: string,
  textStyle?: TextStyle,
) {
  const lines = buildInviteCardLines(invitation, titleFallback);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, theme.palette.bg);
  grad.addColorStop(0.45, theme.palette.accent + "99");
  grad.addColorStop(1, theme.palette.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.fillStyle = theme.palette.text;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 14;

  const kicker = kind === "intro" ? "INVITATION" : "SEE YOU THERE";
  ctx.font = `700 ${Math.max(11, Math.round(w * 0.028))}px Inter, system-ui, sans-serif`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(kicker, w / 2, h * 0.28);
  ctx.globalAlpha = 1;

  const style = textStyle ?? "clean-sans";
  const titleSize = Math.max(22, Math.round(w * 0.07));
  if (style === "script-soft") {
    ctx.font = `500 ${titleSize}px "Segoe Script", "Brush Script MT", cursive`;
  } else if (style === "bold-impact") {
    ctx.font = `800 ${titleSize}px Sora, system-ui, sans-serif`;
  } else if (style === "soft-serif") {
    ctx.font = `600 ${titleSize}px Georgia, "Times New Roman", serif`;
  } else {
    ctx.font = `700 ${titleSize}px Sora, system-ui, sans-serif`;
  }
  ctx.fillText(lines.headline.slice(0, 48), w / 2, h * 0.44, w * 0.86);

  if (lines.subline) {
    ctx.font = `500 ${Math.max(14, Math.round(w * 0.045))}px Inter, system-ui, sans-serif`;
    ctx.fillText(lines.subline.slice(0, 56), w / 2, h * 0.54, w * 0.86);
  }
  if (lines.detail) {
    ctx.globalAlpha = 0.85;
    ctx.font = `400 ${Math.max(12, Math.round(w * 0.032))}px Inter, system-ui, sans-serif`;
    ctx.fillText(lines.detail.slice(0, 64), w / 2, h * 0.64, w * 0.86);
  }
  ctx.restore();
}

function drawTextOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: ExportTextOverlay[],
  theme: ThemeCard,
  w: number,
  h: number,
  timeSec: number,
) {
  for (const o of overlays) {
    if (!o.value?.trim()) continue;
    if (timeSec < o.at || timeSec >= o.end) continue;
    const dur = Math.max(0.01, o.end - o.at);
    const localT = timeSec - o.at;
    const alpha = animAlpha(localT, dur, o.animationIn, o.animationOut);
    const lt = layerTransformAt(o.animation, o.keyframes, localT, dur);
    ctx.save();
    applyTransformToCanvas(ctx, lt, w, h);
    drawStyledText(ctx, o.value.trim(), theme, w, h, {
      style: o.style,
      color: o.color,
      position: o.position ?? (o.role === "title" ? "bottom" : "center"),
      role: o.role,
      alpha: alpha * ctx.globalAlpha,
    });
    ctx.restore();
  }
}

let watermarkLogoPromise: Promise<HTMLImageElement | null> | null = null;

function getWatermarkLogo(): Promise<HTMLImageElement | null> {
  if (!watermarkLogoPromise) {
    const url = assetUrl("/brand/logo-app.png") ?? "/brand/logo-app.png";
    watermarkLogoPromise = loadImage(url)
      .then((img) => img)
      .catch(() => null);
  }
  return watermarkLogoPromise;
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  theme: ThemeCard,
  w: number,
  h: number,
  logo?: HTMLImageElement | null,
) {
  ctx.save();
  const pad = Math.round(w * 0.04);
  if (logo && logo.naturalWidth > 0 && logo.naturalHeight > 0) {
    const markW = Math.max(20, Math.round(w * 0.07));
    const markH = Math.round(markW * (logo.naturalHeight / logo.naturalWidth));
    const x = w - pad - markW;
    const y = h - pad - markH;
    ctx.globalAlpha = 0.42;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.drawImage(logo, x, y, markW, markH);
  } else {
    const size = Math.max(11, Math.round(w * 0.028));
    ctx.font = `600 ${size}px Sora, system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = theme.palette.text;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6;
    ctx.fillText("Voyajes", w - pad, h - pad);
  }
  ctx.restore();
}

function kenBurnsAt(
  photoMotion: ThemeCard["photoMotion"],
  t: number,
): { scale: number; ox: number; oy: number } {
  if (photoMotion === "off") return { scale: 1, ox: 0, oy: 0 };
  const u = Math.min(1, Math.max(0, t));
  if (photoMotion === "bold") {
    return { scale: 1.02 + 0.1 * u, ox: -0.025 * u, oy: 0.015 * u };
  }
  return { scale: 1 + 0.06 * u, ox: -0.015 * u, oy: -0.01 * u };
}

function transitionOpacity(
  kind: TransitionKind,
  enterT: number,
): {
  opacity: number;
  blur: number;
  brightness: number;
  skewX: number;
  translateX: number;
  translateY: number;
  scale: number;
} {
  const t = Math.min(1, Math.max(0, enterT));
  const base = {
    opacity: 1,
    blur: 0,
    brightness: 1,
    skewX: 0,
    translateX: 0,
    translateY: 0,
    scale: 1,
  };
  switch (kind) {
    case "cut":
      return base;
    case "dissolve":
      return { ...base, opacity: t };
    case "push":
      return { ...base, opacity: 0.4 + 0.6 * t, translateX: (1 - t) * 0.28 };
    case "whip":
      return {
        ...base,
        opacity: 0.2 + 0.8 * t,
        blur: (1 - t) * 2,
        skewX: (1 - t) * -6,
        translateX: (1 - t) * 0.6,
      };
    case "light-leak":
      return { ...base, opacity: Math.min(1, t * 1.4), brightness: 1 + (1 - t) * 1.2 };
    case "fade-black":
      return { ...base, opacity: Math.min(1, t * 1.15), brightness: Math.max(0.05, t) };
    case "zoom-through":
      return {
        ...base,
        opacity: 0.15 + 0.85 * t,
        blur: (1 - t) * 3,
        scale: 1 + (1 - t) * 0.35,
      };
    case "slide-up":
      return { ...base, opacity: 0.25 + 0.75 * t, translateY: (1 - t) * 0.32 };
    case "flash":
      return { ...base, opacity: Math.min(1, t * 2), brightness: 1 + (1 - t) * 2 };
    case "slide-left":
      return { ...base, opacity: 0.25 + 0.75 * t, translateX: (1 - t) * -0.34 };
    case "slide-right":
      return { ...base, opacity: 0.25 + 0.75 * t, translateX: (1 - t) * 0.34 };
    case "blur-fade":
      return {
        ...base,
        opacity: t,
        blur: (1 - t) * 12,
        scale: 1 + (1 - t) * 0.04,
        brightness: 1 + (1 - t) * 0.1,
      };
    default:
      return { ...base, opacity: t };
  }
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: ThemeCard,
  label: string,
) {
  ctx.fillStyle = theme.palette.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = theme.palette.accent;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.palette.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(w * 0.045)}px Sora, system-ui, sans-serif`;
  ctx.fillText(label.slice(0, 40), w / 2, h / 2, w * 0.8);
}

/** Cap canvas so width ≤ maxWidth while keeping aspect (even dims for encoders). */
export function gifCanvasSize(aspect: Aspect, maxWidth: number = GIF_EXPORT_DEFAULTS.maxWidth) {
  const full = canvasSizeForAspect(aspect, 1080);
  const scale = Math.min(1, maxWidth / full.width);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return {
    width: even(full.width * scale),
    height: even(full.height * scale),
  };
}

export function filenameFromTitleGif(
  title: string,
  extension: "gif" | "webp",
): string {
  const base =
    title
      .trim()
      .replace(/[^\w\s-]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "voyajes-export";
  return `${base}.${extension}`;
}

/**
 * Try animated WebP via ImageEncoder / experimental APIs — most browsers lack this.
 * Returns null when unsupported so callers fall back to GIF.
 */
async function tryEncodeAnimatedWebp(
  frames: Array<{ bitmap: ImageData; delayMs: number }>,
  signal?: AbortSignal,
): Promise<Blob | null> {
  assertNotAborted(signal);
  // No widely supported browser API for animated WebP encoding yet.
  // Keep a hook for future ImageEncoder / wasm encoders.
  void frames;
  return null;
}

/**
 * Encode slideshow frames to an animated GIF (offline, not real-time).
 * Optionally attempts animated WebP when preferFormat === "webp".
 */
export async function exportSlideshowGif(
  options: ExportGifOptions,
): Promise<ExportGifResult> {
  const {
    clips,
    theme,
    title,
    aspect,
    transition: transitionOverride,
    textOverlays = [],
    captionText = "",
    captionStyle,
    textStyle,
    watermark = false,
    burnTitle = false,
    mode = "voyage",
    invitation,
    maxWidth = GIF_EXPORT_DEFAULTS.maxWidth,
    fps = GIF_EXPORT_DEFAULTS.fps,
    maxDurationSec = GIF_EXPORT_DEFAULTS.maxDurationSec,
    maxColors = GIF_EXPORT_DEFAULTS.maxColors,
    preferFormat = "gif",
    onProgress,
    signal,
    grade,
    defaultAnimation,
    transitionSpec: projectTxSpec,
  } = options;
  const gradeCss = gradeFilter(grade);

  if (clips.length === 0) {
    throw new Error("Add at least one clip before exporting a GIF");
  }
  assertNotAborted(signal);

  const inviteLines = buildInviteCardLines(invitation, title);
  const useInviteCards = mode === "invitation" && inviteLines.hasContent;
  const INTRO_SEC = 2.0;
  const END_SEC = 2.0;
  const defaultTransition = transitionOverride ?? theme.transition;

  const layout = computeLayout(clips, defaultTransition, projectTxSpec, theme);
  const clipsDuration = layout.total;
  const fullDuration =
    clipsDuration + (useInviteCards ? INTRO_SEC + END_SEC : 0);
  const trimmed = fullDuration > maxDurationSec;
  const totalDuration = Math.min(fullDuration, maxDurationSec);

  const totalDurForText = clips.reduce((sum, c) => sum + c.durationSec, 0);
  const timedOverlays: ExportTextOverlay[] = [
    ...textOverlays,
    ...(captionText.trim()
      ? [
          {
            at: 0.4,
            end: Math.max(3, totalDurForText),
            role: "caption" as const,
            value: captionText.trim(),
            style: captionStyle ?? "caption-pill",
            position: "lower-third" as const,
            animationIn: "fade" as const,
            animationOut: "fade" as const,
          },
        ]
      : []),
  ];

  const { width, height } = gifCanvasSize(aspect, maxWidth);
  const skippedVideos: string[] = [];
  const frameInterval = 1 / Math.max(4, Math.min(15, fps));
  const delayMs = Math.max(20, Math.round(frameInterval * 1000)); // gifenc expects ms

  onProgress?.({
    phase: "prepare",
    ratio: 0,
    clipIndex: 0,
    clipCount: clips.length,
    message: `Preparing GIF · ${width}×${height} · ${fps} fps…`,
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("Could not get 2D canvas context for GIF");

  const watermarkLogo = watermark ? await getWatermarkLogo() : null;
  const txSec = Math.max(0.08, theme.transitionDurationMs / 1000);

  // Preload clip sources
  type Loaded = {
    clip: ExportClip;
    image: HTMLImageElement | null;
    video: HTMLVideoElement | null;
    startSec: number;
    endSec: number;
    transitionIn: TransitionKind;
    txSec: number;
    easing?: import("@voyajes/core").Easing;
  };
  const loaded: Loaded[] = [];
  let cursor = useInviteCards ? INTRO_SEC : 0;
  for (let i = 0; i < clips.length; i++) {
    assertNotAborted(signal);
    const clip = clips[i];
    let image: HTMLImageElement | null = null;
    let video: HTMLVideoElement | null = null;
    if (clip.kind === "image") {
      try {
        image = await loadImage(clip.objectUrl, signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        skippedVideos.push(clip.fileName);
      }
    } else {
      try {
        video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = clip.objectUrl;
        await waitVideoReady(video, signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        skippedVideos.push(clip.fileName);
        video = null;
      }
    }
    const startSec = cursor;
    const startOverlap = (useInviteCards ? INTRO_SEC : 0) + layout.starts[i];
    const endSec = startOverlap + clip.durationSec;
    loaded.push({
      clip,
      image,
      video,
      startSec: startOverlap,
      endSec,
      transitionIn: i === 0 ? "cut" : clips[i - 1]?.transitionOut ?? defaultTransition,
      txSec: transitionSecInto(clips, i, projectTxSpec, theme) || txSec,
      easing: transitionEasingInto(clips, i, projectTxSpec),
    });
    cursor = endSec;
  }

  const gif = GIFEncoder();
  const webpFrames: Array<{ bitmap: ImageData; delayMs: number }> = [];
  let frameCount = 0;
  const frameTimes: number[] = [];
  for (let t = 0; t < totalDuration - 1e-6; t += frameInterval) {
    frameTimes.push(t);
  }
  if (frameTimes.length === 0) frameTimes.push(0);

  const drawAt = async (timeSec: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.palette.bg;
    ctx.fillRect(0, 0, width, height);

    if (useInviteCards && timeSec < INTRO_SEC) {
      drawInviteCard(ctx, theme, width, height, "intro", invitation, title, textStyle);
      if (watermark) drawWatermark(ctx, theme, width, height, watermarkLogo);
      return;
    }

    const endCardStart = (useInviteCards ? INTRO_SEC : 0) + clipsDuration;
    if (useInviteCards && timeSec >= endCardStart) {
      drawInviteCard(ctx, theme, width, height, "end", invitation, title, textStyle);
      if (watermark) drawWatermark(ctx, theme, width, height, watermarkLogo);
      return;
    }

    const mediaTime = useInviteCards ? timeSec - INTRO_SEC : timeSec;
    const f = framesAt(layout, clips, Math.max(0, mediaTime));
    const seekVideo = async (L: Loaded, local: number) => {
      const v = L.video;
      if (!v) return;
      const dur = v.duration || 0;
      let vt = sourceTimeAt(L.clip, local);
      if (dur > 0) vt = Math.min(vt % Math.max(dur, 0.1), Math.max(0, dur - 0.05));
      if (Math.abs(v.currentTime - vt) > 0.04) {
        v.currentTime = vt;
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          v.addEventListener("seeked", done, { once: true });
          window.setTimeout(done, 120);
        });
      }
    };
    const drawL = async (k: number, local: number, tx: { kind: TransitionKind; p: number } | null) => {
      const L = loaded[k];
      if (!L) return;
      try {
        await seekVideo(L, local);
      } catch {
        /* draw whatever frame is ready */
      }
      drawClipLayer(ctx, {
        clip: L.clip,
        image: L.image,
        video: L.video,
        local,
        width,
        height,
        theme,
        gradeCss,
        anim: L.clip.animation ?? defaultAnimation,
        tx,
      });
    };
    if (f.prev) await drawL(f.prev.index, f.prev.local, null);
    await drawL(
      f.index,
      f.local,
      f.prev
        ? {
            kind: loaded[f.index].transitionIn,
            p: ease(loaded[f.index].easing ?? "linear", f.progress),
          }
        : null,
    );

    fillThemeGrade(ctx, theme, width, height, 0.45);
    fillVignette(ctx, theme, width, height, 0.7);

    if (burnTitle && title.trim() && title.trim() !== "Untitled voyage") {
      const hasTimedTitle = timedOverlays.some(
        (o) =>
          o.role === "title" &&
          timeSec >= o.at &&
          timeSec < o.end &&
          o.value.trim(),
      );
      if (!hasTimedTitle) {
        drawTitle(ctx, title, theme, width, height, textStyle);
      }
    }
    drawTextOverlays(ctx, timedOverlays, theme, width, height, timeSec);
    if (watermark) drawWatermark(ctx, theme, width, height, watermarkLogo);
  };

  for (let fi = 0; fi < frameTimes.length; fi++) {
    assertNotAborted(signal);
    const t = frameTimes[fi];
    onProgress?.({
      phase: "recording",
      ratio: frameTimes.length > 1 ? fi / (frameTimes.length - 1) : 1,
      clipIndex: Math.min(
        clips.length - 1,
        loaded.findIndex(
          (L) => t >= L.startSec && t < L.endSec,
        ) >= 0
          ? loaded.findIndex((L) => t >= L.startSec && t < L.endSec)
          : 0,
      ),
      clipCount: clips.length,
      message: `Encoding GIF frame ${fi + 1}/${frameTimes.length}…`,
    });

    await drawAt(t);
    const imageData = ctx.getImageData(0, 0, width, height);
    const rgba = imageData.data;
    const palette = quantize(rgba, maxColors, { format: "rgb565" });
    const index = applyPalette(rgba, palette, "rgb565");
    gif.writeFrame(index, width, height, {
      palette,
      delay: delayMs,
      repeat: 0,
    });
    if (preferFormat === "webp") {
      webpFrames.push({
        bitmap: new ImageData(new Uint8ClampedArray(rgba), width, height),
        delayMs,
      });
    }
    frameCount++;
    // Yield so the UI can update
    if (fi % 3 === 0) {
      await new Promise<void>((r) => window.setTimeout(r, 0));
    }
  }

  // Cleanup videos
  for (const L of loaded) {
    if (L.video) {
      L.video.pause();
      L.video.removeAttribute("src");
      L.video.load();
    }
  }

  onProgress?.({
    phase: "finalize",
    ratio: 0.98,
    clipIndex: clips.length,
    clipCount: clips.length,
    message: "Finalizing GIF…",
  });

  let extension: "gif" | "webp" = "gif";
  let mimeType = "image/gif";
  let blob: Blob;

  if (preferFormat === "webp") {
    const webpBlob = await tryEncodeAnimatedWebp(webpFrames, signal);
    if (webpBlob && webpBlob.size > 64) {
      blob = webpBlob;
      extension = "webp";
      mimeType = "image/webp";
    } else {
      gif.finish();
      blob = new Blob([Uint8Array.from(gif.bytes())], { type: "image/gif" });
    }
  } else {
    gif.finish();
    blob = new Blob([Uint8Array.from(gif.bytes())], { type: "image/gif" });
  }

  if (blob.size < 64) {
    throw new Error("GIF export produced an empty file");
  }

  const kb = Math.round(blob.size / 1024);
  const sizeNote = trimmed
    ? `${width}×${height} · ${fps} fps · trimmed to ~${Math.round(totalDuration)}s · ${kb} KB`
    : `${width}×${height} · ${fps} fps · ~${Math.round(totalDuration)}s · ${kb} KB`;

  onProgress?.({
    phase: "finalize",
    ratio: 1,
    clipIndex: clips.length,
    clipCount: clips.length,
    message: `Done · ${extension.toUpperCase()} ${kb} KB`,
  });

  return {
    blob,
    mimeType,
    extension,
    width,
    height,
    durationSec: totalDuration,
    frameCount,
    trimmed,
    skippedVideos,
    sizeNote,
  };
}

/** Threshold where WhatsApp try-out should prefer GIF over a heavy video. */
export const VIDEO_HEAVY_BYTES = 6 * 1024 * 1024;
