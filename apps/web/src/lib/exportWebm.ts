/**
 * Browser-side slideshow → WebM (or MP4 if MediaRecorder allows) via canvas + MediaRecorder.
 * Best-effort theme grade, Ken Burns, and transitions.
 * When a beat previewUrl is provided, muxes catalog audio via AudioContext +
 * MediaStreamDestination into MediaRecorder. Falls back to video-only with a soft warning.
 * Cloud / FFmpeg / Remotion encode remains a future path.
 */

import type { Aspect, TransitionKind } from "@voyajes/core";
import type { ThemeCard } from "../data/themes";

export type ExportClip = {
  id: string;
  kind: "image" | "video";
  objectUrl: string;
  fileName: string;
  durationSec: number;
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
  /** Catalog beat preview URL (same-origin MP3). Required to attempt mux. */
  previewUrl?: string;
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
};

export type ExportWebmOptions = {
  clips: ExportClip[];
  theme: ThemeCard;
  title: string;
  aspect: Aspect;
  /** Override theme.transition for this export */
  transition?: TransitionKind;
  /** Target short-edge ~1080; long edge follows aspect */
  shortEdge?: number;
  fps?: number;
  /** Soft Voyajes watermark stub (bottom-right) */
  watermark?: boolean;
  /** Optional catalog beat to mux into the recording */
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
 * Decode a catalog preview MP3 and expose it as a MediaStream track via
 * AudioContext + MediaStreamAudioDestinationNode. Loops for the export length.
 */
async function captureBeatAudioStream(
  previewUrl: string,
  opts: { ducking?: boolean; signal?: AbortSignal },
): Promise<CapturedBeatAudio> {
  assertNotAborted(opts.signal);
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) {
    throw new Error("Web Audio API is not available");
  }

  const res = await fetch(previewUrl, { signal: opts.signal });
  if (!res.ok) {
    throw new Error(`Beat preview fetch failed (${res.status})`);
  }
  const raw = await res.arrayBuffer();
  assertNotAborted(opts.signal);

  const ctx = new AC();
  try {
    await ctx.resume();
  } catch {
    /* some browsers resume on gesture only — export is already user-gestured */
  }

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(raw.slice(0));
  } catch (err) {
    await ctx.close().catch(() => undefined);
    throw err instanceof Error
      ? err
      : new Error("Could not decode beat preview audio");
  }

  const dest = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  const gain = ctx.createGain();
  // Mild trim when ducking metadata is on; true dialogue ducking is still TODO
  gain.gain.value = opts.ducking ? 0.55 : 0.85;
  source.connect(gain);
  gain.connect(dest);
  // Do not connect to ctx.destination — keep export silent in speakers
  source.start(0);

  const audioTracks = dest.stream.getAudioTracks();
  if (audioTracks.length === 0) {
    source.stop();
    await ctx.close().catch(() => undefined);
    throw new Error("No audio track from MediaStreamDestination");
  }

  let stopped = false;
  return {
    stream: dest.stream,
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        source.stop();
      } catch {
        /* already stopped */
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

function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  theme: ThemeCard,
  w: number,
  h: number,
  subtitle: string,
) {
  ctx.save();
  ctx.fillStyle = theme.palette.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  const pad = Math.round(w * 0.06);
  const titleSize = Math.max(22, Math.round(w * 0.055));
  ctx.font = `600 ${titleSize}px Sora, system-ui, sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 12;
  ctx.fillText(title.slice(0, 48), pad, h - pad - titleSize * 0.7, w - pad * 2);
  ctx.font = `400 ${Math.max(14, Math.round(titleSize * 0.45))}px Inter, system-ui, sans-serif`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(subtitle, pad, h - pad, w - pad * 2);
  ctx.restore();
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  theme: ThemeCard,
  w: number,
  h: number,
) {
  ctx.save();
  const pad = Math.round(w * 0.04);
  const size = Math.max(12, Math.round(w * 0.028));
  ctx.font = `600 ${size}px Sora, system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = theme.palette.text;
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 8;
  ctx.fillText("Voyajes", w - pad, h - pad);
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
    default:
      return base;
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
    shortEdge = 1080,
    fps = 30,
    watermark = false,
    audio,
    onProgress,
    signal,
  } = options;
  const activeTransition = transitionOverride ?? theme.transition;

  if (clips.length === 0) {
    throw new Error("Add at least one clip before exporting video");
  }
  assertNotAborted(signal);

  const { width, height } = canvasSizeForAspect(aspect, shortEdge);
  const totalDuration = clips.reduce((s, c) => s + c.durationSec, 0);
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

  recorder.start(200);

  const txMs = Math.max(80, theme.transitionDurationMs);
  let elapsedTotal = 0;

  try {
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
        const tx = transitionOpacity(activeTransition, enterT);
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
        drawTitle(
          ctx,
          title,
          theme,
          width,
          height,
          `${activeTransition} · ${theme.motion} · ${i + 1}/${clips.length}`,
        );
        if (watermark) {
          drawWatermark(ctx, theme, width, height);
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
