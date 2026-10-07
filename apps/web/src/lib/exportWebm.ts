/**
 * Browser-side slideshow → WebM (or MP4 if MediaRecorder allows) via canvas + MediaRecorder.
 * Best-effort theme grade, Ken Burns, and transitions.
 * When a beat previewUrl is provided, muxes catalog audio via AudioContext +
 * MediaStreamDestination into MediaRecorder. Falls back to video-only with a soft warning.
 * Cloud / FFmpeg / Remotion encode remains a future path.
 */

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

export type ExportClip = {
  id: string;
  kind: "image" | "video";
  objectUrl: string;
  fileName: string;
  durationSec: number;
  /** Transition used when leaving this clip into the next */
  transitionOut?: TransitionKind | null;
};

export type ExportTextOverlay = {
  id?: string;
  at: number;
  end: number;
  role: "title" | "subtitle" | "caption";
  value: string;
  style?: TextStyle;
  color?: string;
  position?: TextPosition;
  animationIn?: TextTransition;
  animationOut?: TextTransition;
};

export type ExportProgress = {
  phase: "prepare" | "recording" | "finalize";
  /** 0–1 overall */
  ratio: number;
  clipIndex: number;
  clipCount: number;
  message: string;
};

export type ExportAudioOptions = {
  /** Catalog beat preview URL (same-origin MP3) and/or custom sound URL. */
  previewUrl?: string;
  /** Optional second URL mixed under the primary (mixMode=mix). */
  mixUrl?: string;
  /** Soft label for status messages */
  beatName?: string;
  /**
   * When true, skip audio entirely (beat stays as project metadata).
   * Per-clip mute is unrelated — clip camera audio is never captured.
   */
  mute?: boolean;
  /**
   * Ducking is project metadata for a future dialogue mix.
   * When true and we do mux, apply a mild gain trim only (no true ducking).
   */
  ducking?: boolean;
  /** Gain for primary track (default 0.85 / 0.72 with ducking). */
  primaryGain?: number;
  /** Gain for mix underlay (default 0.45). */
  mixGain?: number;
};

export type ExportWebmOptions = {
  clips: ExportClip[];
  theme: ThemeCard;
  title: string;
  aspect: Aspect;
  /** Global default transition when a clip has no transitionOut */
  transition?: TransitionKind;
  /** Timed text overlays drawn during export */
  textOverlays?: ExportTextOverlay[];
  /** Legacy caption under title when no overlays cover it */
  captionText?: string;
  captionStyle?: TextStyle;
  textStyle?: TextStyle;
  /** Target short-edge ~1080; long edge follows aspect */
  shortEdge?: number;
  fps?: number;
  /** Soft Voyajes logo watermark (bottom-right) */
  watermark?: boolean;
  /**
   * When true, burn project title on every frame (legacy).
   * Default false — only timed overlays + optional invitation cards.
   */
  burnTitle?: boolean;
  /** voyage vs invitation — invitation gets intro/end cards */
  mode?: ProjectMode;
  /** Invitation who/what/when/where for intro/end cards */
  invitation?: InvitationMeta;
  /** Optional catalog / custom beat to mux into the recording */
  audio?: ExportAudioOptions;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
};

export type ExportWebmResult = {
  blob: Blob;
  mimeType: string;
  extension: "webm" | "mp4";
  width: number;
  height: number;
  durationSec: number;
  skippedVideos: string[];
  /** True when an audio track was successfully added to MediaRecorder */
  audioMuxed: boolean;
  /** Soft warning when audio was requested but video-only was exported */
  audioWarning?: string;
};

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new DOMException("Export cancelled", "AbortError");
    throw err;
  }
}

export function pickRecorderMime(withAudio = false): {
  mimeType: string;
  extension: "webm" | "mp4";
} {
  const videoOnly: Array<{ mimeType: string; extension: "webm" | "mp4" }> = [
    { mimeType: "video/webm;codecs=vp9", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
    { mimeType: "video/mp4", extension: "mp4" },
  ];
  const withOpus: Array<{ mimeType: string; extension: "webm" | "mp4" }> = [
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
    { mimeType: "video/webm;codecs=vp9", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
    { mimeType: "video/mp4", extension: "mp4" },
  ];
  const candidates = withAudio ? withOpus : videoOnly;
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  // Last resort — let the browser pick
  return { mimeType: "", extension: "webm" };
}

type CapturedBeatAudio = {
  stream: MediaStream;
  stop: () => void;
};

/**
 * Decode preview / custom audio URL(s) and expose as a MediaStream track via
 * AudioContext + MediaStreamAudioDestinationNode. Loops for the export length.
 * Optional mixUrl is mixed under the primary (custom + catalog, etc.).
 */
async function captureBeatAudioStream(
  previewUrl: string,
  opts: {
    ducking?: boolean;
    signal?: AbortSignal;
    mixUrl?: string;
    primaryGain?: number;
    mixGain?: number;
  },
): Promise<CapturedBeatAudio> {
  assertNotAborted(opts.signal);
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) {
    throw new Error("Web Audio API is not available");
  }

  const decodeUrl = async (url: string): Promise<AudioBuffer> => {
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) {
      throw new Error(`Audio fetch failed (${res.status})`);
    }
    const raw = await res.arrayBuffer();
    assertNotAborted(opts.signal);
    return ctx.decodeAudioData(raw.slice(0));
  };

  const ctx = new AC();
  try {
    await ctx.resume();
  } catch {
    /* some browsers resume on gesture only — export is already user-gestured */
  }

  let primary: AudioBuffer;
  try {
    primary = await decodeUrl(previewUrl);
  } catch (err) {
    await ctx.close().catch(() => undefined);
    throw err instanceof Error
      ? err
      : new Error("Could not decode beat preview audio");
  }

  let mix: AudioBuffer | null = null;
  if (opts.mixUrl) {
    try {
      mix = await decodeUrl(opts.mixUrl);
    } catch {
      mix = null;
    }
  }

  const dest = ctx.createMediaStreamDestination();
  const sources: AudioBufferSourceNode[] = [];
  const startSource = (buf: AudioBuffer, gainValue: number) => {
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(dest);
    source.start(0);
    sources.push(source);
  };

  const primaryGain =
    opts.primaryGain ?? (opts.ducking ? 0.55 : 0.85);
  startSource(primary, primaryGain);
  if (mix) {
    startSource(mix, opts.mixGain ?? 0.4);
  }

  const audioTracks = dest.stream.getAudioTracks();
  if (audioTracks.length === 0) {
    for (const src of sources) {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
    }
    await ctx.close().catch(() => undefined);
    throw new Error("No audio track from MediaStreamDestination");
  }

  let stopped = false;
  return {
    stream: dest.stream,
    stop: () => {
      if (stopped) return;
      stopped = true;
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const t of dest.stream.getAudioTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
      void ctx.close().catch(() => undefined);
    },
  };
}

export function canvasSizeForAspect(
  aspect: Aspect,
  shortEdge = 1080,
): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  switch (aspect) {
    case "16:9":
      return { width: even(shortEdge * (16 / 9)), height: even(shortEdge) };
    case "1:1":
      return { width: even(shortEdge), height: even(shortEdge) };
    case "4:5":
      return { width: even(shortEdge), height: even(shortEdge * (5 / 4)) };
    case "9:16":
    default:
      return { width: even(shortEdge), height: even(shortEdge * (16 / 9)) };
  }
}

/** Safe download basename from project title */
export function filenameFromTitle(title: string, extension: "webm" | "mp4"): string {
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

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the browser has a chance to start the download
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
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
      reject(new Error("Failed to load image for export"));
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
      reject(new Error("Failed to load video for export"));
    };
  });
}

/** Cover-fit draw of an image/video frame into the canvas */
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

/** Approximate CSS multi-stop linear gradient used by themes */
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
      return `800 ${size}px Sora, system-ui, sans-serif`;
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
  if (animationIn && localT < inDur) {
    a = Math.min(a, localT / inDur);
  }
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
  const size = Math.max(
    isTitle ? 22 : 14,
    Math.round(w * (isTitle ? 0.055 : 0.038)),
  );
  const { y, baseline } = positionY(opts.position, h, pad);
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.fillStyle = opts.color || theme.palette.text;
  ctx.textAlign = opts.position === "center" ? "center" : "left";
  ctx.textBaseline = baseline;
  ctx.font = fontForStyle(opts.style, size);
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 12;
  const x = opts.position === "center" ? w / 2 : pad;
  const maxW = w - pad * 2;
  if (opts.style === "caption-pill") {
    const metrics = ctx.measureText(text.slice(0, 64));
    const tw = Math.min(metrics.width, maxW) + 20;
    const th = size * 1.4;
    const bx = opts.position === "center" ? x - tw / 2 : x - 10;
    const by =
      baseline === "bottom"
        ? y - th
        : baseline === "middle"
          ? y - th / 2
          : y - 4;
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
  subtitle: string,
  style?: TextStyle,
) {
  drawStyledText(ctx, title, theme, w, h, {
    style: style ?? "clean-sans",
    position: "bottom",
    role: "title",
    color: theme.palette.text,
  });
  if (subtitle) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    const pad = Math.round(w * 0.06);
    const titleSize = Math.max(22, Math.round(w * 0.055));
    ctx.fillStyle = theme.palette.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = `400 ${Math.max(14, Math.round(titleSize * 0.45))}px Inter, system-ui, sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 8;
    ctx.fillText(subtitle, pad, h - pad, w - pad * 2);
    ctx.restore();
  }
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
  // Full-bleed gradient card
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
  ctx.shadowBlur = 16;

  const kicker = kind === "intro" ? "INVITATION" : "SEE YOU THERE";
  ctx.font = `700 ${Math.max(12, Math.round(w * 0.028))}px Inter, system-ui, sans-serif`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(kicker, w / 2, h * 0.28);
  ctx.globalAlpha = 1;

  const style = textStyle ?? "clean-sans";
  const titleSize = Math.max(28, Math.round(w * 0.07));
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
    ctx.font = `500 ${Math.max(18, Math.round(w * 0.045))}px Inter, system-ui, sans-serif`;
    ctx.fillText(lines.subline.slice(0, 56), w / 2, h * 0.54, w * 0.86);
  }
  if (lines.detail) {
    ctx.globalAlpha = 0.85;
    ctx.font = `400 ${Math.max(14, Math.round(w * 0.032))}px Inter, system-ui, sans-serif`;
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
    drawStyledText(ctx, o.value.trim(), theme, w, h, {
      style: o.style,
      color: o.color,
      position: o.position ?? (o.role === "title" ? "bottom" : "center"),
      role: o.role,
      alpha,
    });
  }
}

/** Cached Voyajes logo for export watermark (null if load failed). */
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
    const markW = Math.max(24, Math.round(w * 0.07));
    const markH = Math.round(markW * (logo.naturalHeight / logo.naturalWidth));
    const x = w - pad - markW;
    const y = h - pad - markH;
    ctx.globalAlpha = 0.42;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.drawImage(logo, x, y, markW, markH);
  } else {
    const size = Math.max(12, Math.round(w * 0.028));
    ctx.font = `600 ${size}px Sora, system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = theme.palette.text;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 8;
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
    return {
      scale: 1.02 + 0.1 * u,
      ox: -0.025 * u,
      oy: 0.015 * u,
    };
  }
  return {
    scale: 1 + 0.06 * u,
    ox: -0.015 * u,
    oy: -0.01 * u,
  };
}

function transitionOpacity(
  kind: TransitionKind,
  /** 0 at clip start → 1 after transitionDuration */
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
      return {
        ...base,
        opacity: 0.4 + 0.6 * t,
        translateX: (1 - t) * 0.28,
      };
    case "whip":
      return {
        ...base,
        opacity: 0.2 + 0.8 * t,
        blur: (1 - t) * 2,
        skewX: (1 - t) * -6,
        translateX: (1 - t) * 0.6,
      };
    case "light-leak":
      return {
        ...base,
        opacity: Math.min(1, t * 1.4),
        brightness: 1 + (1 - t) * 1.2,
      };
    case "fade-black":
      return {
        ...base,
        opacity: Math.min(1, t * 1.15),
        brightness: Math.max(0.05, t),
      };
    case "zoom-through":
      return {
        ...base,
        opacity: 0.15 + 0.85 * t,
        blur: (1 - t) * 3,
        scale: 1 + (1 - t) * 0.35,
      };
    case "slide-up":
      return {
        ...base,
        opacity: 0.25 + 0.75 * t,
        translateY: (1 - t) * 0.32,
      };
    case "flash":
      return {
        ...base,
        opacity: Math.min(1, t * 2),
        brightness: 1 + (1 - t) * 2,
      };
    case "slide-left":
      return {
        ...base,
        opacity: 0.25 + 0.75 * t,
        translateX: (1 - t) * -0.34,
      };
    case "slide-right":
      return {
        ...base,
        opacity: 0.25 + 0.75 * t,
        translateX: (1 - t) * 0.34,
      };
    case "circle-wipe":
      return {
        ...base,
        opacity: 0.15 + 0.85 * t,
        scale: 1 + (1 - t) * 0.08,
      };
    case "blur-fade":
      return {
        ...base,
        opacity: t,
        blur: (1 - t) * 12,
        scale: 1 + (1 - t) * 0.04,
        brightness: 1 + (1 - t) * 0.1,
      };
    case "spin":
      return {
        ...base,
        opacity: 0.2 + 0.8 * t,
        blur: (1 - t) * 2,
        scale: 0.86 + 0.14 * t,
        skewX: (1 - t) * -8,
      };
    case "glitch":
      return {
        ...base,
        opacity: 0.2 + 0.8 * t,
        translateX: (1 - t) * (t < 0.5 ? -0.03 : 0.02),
        skewX: (1 - t) * (t < 0.5 ? -4 : 3),
        brightness: 1 + (1 - t) * 0.35,
      };
    case "heart-wipe":
      return {
        ...base,
        opacity: 0.1 + 0.9 * t,
        scale: 0.92 + 0.08 * t,
        brightness: 1 + (1 - t) * 0.25,
      };
    case "soft-bloom":
      return {
        ...base,
        opacity: Math.min(1, t * 1.35),
        blur: (1 - t) * 8,
        brightness: 1 + (1 - t) * 0.6,
        scale: 1 + (1 - t) * 0.06,
      };
    default:
      // Unknown kinds fall back to a soft dissolve so exports never hard-cut.
      return { ...base, opacity: t };
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Export cancelled", "AbortError"));
      return;
    }
    const id = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(id);
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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

/**
 * Record the slideshow to a video Blob. Runs in near real-time (MediaRecorder).
 */
export async function exportSlideshowWebm(
  options: ExportWebmOptions,
): Promise<ExportWebmResult> {
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
    shortEdge = 1080,
    fps = 30,
    watermark = false,
    burnTitle = false,
    mode = "voyage",
    invitation,
    audio,
    onProgress,
    signal,
  } = options;
  const inviteLines = buildInviteCardLines(invitation, title);
  const useInviteCards = mode === "invitation" && inviteLines.hasContent;
  const INTRO_SEC = 2.4;
  const END_SEC = 2.6;
  const defaultTransition = transitionOverride ?? theme.transition;
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

  if (clips.length === 0) {
    throw new Error("Add at least one clip before exporting video");
  }
  assertNotAborted(signal);

  const { width, height } = canvasSizeForAspect(aspect, shortEdge);
  const clipsDuration = clips.reduce((s, c) => s + c.durationSec, 0);
  const totalDuration = clipsDuration + (useInviteCards ? INTRO_SEC + END_SEC : 0);
  const skippedVideos: string[] = [];
  let audioMuxed = false;
  let audioWarning: string | undefined;
  let beatAudio: CapturedBeatAudio | null = null;

  onProgress?.({
    phase: "prepare",
    ratio: 0,
    clipIndex: 0,
    clipCount: clips.length,
    message: "Preparing export…",
  });

  const wantAudio =
    Boolean(audio?.previewUrl) && audio?.mute !== true;

  if (wantAudio && audio?.previewUrl) {
    onProgress?.({
      phase: "prepare",
      ratio: 0.02,
      clipIndex: 0,
      clipCount: clips.length,
      message: `Loading beat audio${audio.beatName ? ` · ${audio.beatName}` : ""}…`,
    });
    try {
      beatAudio = await captureBeatAudioStream(audio.previewUrl, {
        ducking: audio.ducking,
        signal,
        mixUrl: audio.mixUrl,
        primaryGain: audio.primaryGain,
        mixGain: audio.mixGain,
      });
      audioMuxed = true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const detail = err instanceof Error ? err.message : "unknown error";
      audioWarning = `Beat audio could not be muxed (${detail}) — exporting video only`;
      beatAudio = null;
      audioMuxed = false;
    }
  } else if (audio?.mute && audio?.previewUrl) {
    audioWarning = "Beat muted for export — video only";
  }

  let mimeType = "";
  let extension: "webm" | "mp4" = "webm";
  ({ mimeType, extension } = pickRecorderMime(audioMuxed));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    beatAudio?.stop();
    throw new Error("Could not get 2D canvas context");
  }

  // Warm first frame so the recorder has content immediately
  ctx.fillStyle = theme.palette.bg;
  ctx.fillRect(0, 0, width, height);

  const canvasStream = canvas.captureStream(fps);

  const buildRecorder = (useAudio: boolean): MediaRecorder => {
    const picked = pickRecorderMime(useAudio);
    mimeType = picked.mimeType;
    extension = picked.extension;
    const recordStream =
      useAudio && beatAudio
        ? new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...beatAudio.stream.getAudioTracks(),
          ])
        : canvasStream;
    const opts: MediaRecorderOptions = {
      videoBitsPerSecond: 6_000_000,
    };
    if (mimeType) opts.mimeType = mimeType;
    if (useAudio) opts.audioBitsPerSecond = 128_000;
    return new MediaRecorder(recordStream, opts);
  };

  let recorder: MediaRecorder;
  try {
    recorder = buildRecorder(audioMuxed);
  } catch (err) {
    if (audioMuxed && beatAudio) {
      const detail =
        err instanceof Error ? err.message : "MediaRecorder rejected audio";
      audioWarning = `Beat audio could not be muxed (${detail}) — exporting video only`;
      beatAudio.stop();
      beatAudio = null;
      audioMuxed = false;
      recorder = buildRecorder(false);
    } else {
      beatAudio?.stop();
      throw err;
    }
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () =>
      reject(new Error("MediaRecorder failed during export"));
  });

  const cleanupStreams = () => {
    beatAudio?.stop();
    beatAudio = null;
    for (const t of canvasStream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
  };

  const onAbortRecording = () => {
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    cleanupStreams();
  };
  signal?.addEventListener("abort", onAbortRecording, { once: true });

  if (audioMuxed) {
    onProgress?.({
      phase: "prepare",
      ratio: 0.05,
      clipIndex: 0,
      clipCount: clips.length,
      message: `Recording with beat${audio?.beatName ? ` · ${audio.beatName}` : ""}…`,
    });
  } else if (audioWarning) {
    onProgress?.({
      phase: "prepare",
      ratio: 0.05,
      clipIndex: 0,
      clipCount: clips.length,
      message: audioWarning,
    });
  }

  const watermarkLogo = watermark ? await getWatermarkLogo() : null;

  recorder.start(200);

  const txMs = Math.max(80, theme.transitionDurationMs);
  let elapsedTotal = 0;

  try {
  
  // Invitation intro card
  if (useInviteCards) {
    onProgress?.({
      phase: "recording",
      ratio: 0,
      clipIndex: 0,
      clipCount: clips.length,
      message: "Recording invite intro…",
    });
    const introStart = performance.now();
    while ((performance.now() - introStart) / 1000 < INTRO_SEC) {
      assertNotAborted(signal);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawInviteCard(ctx, theme, width, height, "intro", invitation, title, textStyle);
      if (watermark) drawWatermark(ctx, theme, width, height, watermarkLogo);
      await sleep(1000 / fps, signal);
    }
    elapsedTotal += INTRO_SEC;
  }

  for (let i = 0; i < clips.length; i++) {
      assertNotAborted(signal);
      const clip = clips[i];
      onProgress?.({
        phase: "recording",
        ratio: totalDuration > 0 ? elapsedTotal / totalDuration : 0,
        clipIndex: i,
        clipCount: clips.length,
        message: `Recording clip ${i + 1}/${clips.length}…`,
      });

      const holdMs = Math.max(400, clip.durationSec * 1000);
      const start = performance.now();
      const clipTransition: TransitionKind =
        i === 0
          ? "cut"
          : clips[i - 1]?.transitionOut ?? defaultTransition;

      let image: HTMLImageElement | null = null;
      let video: HTMLVideoElement | null = null;
      let drawVideo = false;

      if (clip.kind === "image") {
        image = await loadImage(clip.objectUrl, signal);
      } else {
        try {
          video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";
          video.src = clip.objectUrl;
          await waitVideoReady(video, signal);
          video.currentTime = 0;
          await video.play().catch(() => {
            /* draw still frame if play blocked */
          });
          drawVideo = true;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          skippedVideos.push(clip.fileName);
          video = null;
          drawVideo = false;
        }
      }

      while (performance.now() - start < holdMs) {
        assertNotAborted(signal);
        const localT = (performance.now() - start) / holdMs;
        const enterT = Math.min(1, (performance.now() - start) / txMs);
        const tx = transitionOpacity(clipTransition, enterT);
        const ken =
          clip.kind === "image"
            ? kenBurnsAt(theme.photoMotion, localT)
            : { scale: 1, ox: 0, oy: 0 };

        ctx.save();
        ctx.fillStyle = theme.palette.bg;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalAlpha = tx.opacity;
        if (tx.translateX || tx.translateY || tx.skewX || tx.scale !== 1) {
          ctx.translate(
            tx.translateX * width + (width * (1 - tx.scale)) / 2,
            tx.translateY * height + (height * (1 - tx.scale)) / 2,
          );
          if (tx.scale !== 1) {
            ctx.scale(tx.scale, tx.scale);
          }
          if (tx.skewX) {
            ctx.transform(1, 0, Math.tan((tx.skewX * Math.PI) / 180), 1, 0, 0);
          }
        }
        if (tx.brightness !== 1) {
          ctx.filter = `brightness(${tx.brightness})${tx.blur ? ` blur(${tx.blur}px)` : ""}`;
        } else if (tx.blur) {
          ctx.filter = `blur(${tx.blur}px)`;
        }

        if (image) {
          drawCover(
            ctx,
            image,
            image.naturalWidth,
            image.naturalHeight,
            width,
            height,
            ken.scale,
            ken.ox,
            ken.oy,
          );
        } else if (drawVideo && video) {
          const vw = video.videoWidth || width;
          const vh = video.videoHeight || height;
          if (vw > 0 && vh > 0) {
            drawCover(ctx, video, vw, vh, width, height, 1, 0, 0);
          } else {
            drawPlaceholder(ctx, width, height, theme, clip.fileName);
          }
        } else {
          drawPlaceholder(
            ctx,
            width,
            height,
            theme,
            clip.kind === "video" ? `Video skipped · ${clip.fileName}` : clip.fileName,
          );
        }
        ctx.restore();

        fillThemeGrade(ctx, theme, width, height, 0.45);
        fillVignette(ctx, theme, width, height, 0.7);
        const nowSec = elapsedTotal + (performance.now() - start) / 1000;
        // Only burn title when explicitly requested (legacy) — never "Untitled voyage" by default
        if (burnTitle && title.trim() && title.trim() !== "Untitled voyage") {
          const hasTimedTitle = timedOverlays.some(
            (o) =>
              o.role === "title" &&
              nowSec >= o.at &&
              nowSec < o.end &&
              o.value.trim(),
          );
          if (!hasTimedTitle) {
            drawTitle(
              ctx,
              title,
              theme,
              width,
              height,
              "",
              textStyle,
            );
          }
        }
        drawTextOverlays(
          ctx,
          timedOverlays,
          theme,
          width,
          height,
          nowSec,
        );
        if (watermark) {
          drawWatermark(ctx, theme, width, height, watermarkLogo);
        }
        ctx.restore();

        const nowElapsed = elapsedTotal + (performance.now() - start) / 1000;
        onProgress?.({
          phase: "recording",
          ratio: totalDuration > 0 ? Math.min(0.99, nowElapsed / totalDuration) : 0,
          clipIndex: i,
          clipCount: clips.length,
          message: `Recording ${i + 1}/${clips.length} · ${Math.round(
            (nowElapsed / Math.max(totalDuration, 0.01)) * 100,
          )}%`,
        });

        // Pace roughly to fps without starving the recorder
        await sleep(1000 / fps, signal);
      }

      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }

      elapsedTotal += clip.durationSec;
    }


  // Invitation end card
  if (useInviteCards) {
    onProgress?.({
      phase: "recording",
      ratio: Math.min(0.98, elapsedTotal / Math.max(totalDuration, 0.01)),
      clipIndex: clips.length,
      clipCount: clips.length,
      message: "Recording invite end card…",
    });
    const endStart = performance.now();
    while ((performance.now() - endStart) / 1000 < END_SEC) {
      assertNotAborted(signal);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawInviteCard(ctx, theme, width, height, "end", invitation, title, textStyle);
      if (watermark) drawWatermark(ctx, theme, width, height, watermarkLogo);
      await sleep(1000 / fps, signal);
    }
    elapsedTotal += END_SEC;
  }

    onProgress?.({
      phase: "finalize",
      ratio: 0.99,
      clipIndex: clips.length,
      clipCount: clips.length,
      message: "Finalizing file…",
    });

    // Let the last frames flush into the recorder
    await sleep(120, signal);
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
  } catch (err) {
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    cleanupStreams();
    signal?.removeEventListener("abort", onAbortRecording);
    throw err;
  }

  cleanupStreams();
  signal?.removeEventListener("abort", onAbortRecording);

  const outType = recorder.mimeType || mimeType || "video/webm";
  const blob = new Blob(chunks, { type: outType });
  if (blob.size < 64) {
    throw new Error("Export produced an empty file — MediaRecorder may be blocked");
  }

  onProgress?.({
    phase: "finalize",
    ratio: 1,
    clipIndex: clips.length,
    clipCount: clips.length,
    message: audioMuxed
      ? "Done · video + beat audio"
      : audioWarning
        ? "Done · video only"
        : "Done",
  });

  return {
    blob,
    mimeType: outType,
    extension: outType.includes("mp4") ? "mp4" : extension,
    width,
    height,
    durationSec: totalDuration,
    skippedVideos,
    audioMuxed,
    audioWarning,
  };
}
