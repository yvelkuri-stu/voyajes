/**
 * Browser-side slideshow → WebM (or MP4 if MediaRecorder allows) via canvas + MediaRecorder.
 * Best-effort theme grade, Ken Burns, and transitions. No audio mux yet.
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

export type ExportWebmOptions = {
  clips: ExportClip[];
  theme: ThemeCard;
  title: string;
  aspect: Aspect;
  /** Target short-edge ~1080; long edge follows aspect */
  shortEdge?: number;
  fps?: number;
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
};

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new DOMException("Export cancelled", "AbortError");
    throw err;
  }
}

export function pickRecorderMime(): { mimeType: string; extension: "webm" | "mp4" } {
  const candidates: Array<{ mimeType: string; extension: "webm" | "mp4" }> = [
    { mimeType: "video/webm;codecs=vp9", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
    { mimeType: "video/mp4", extension: "mp4" },
  ];
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  // Last resort — let the browser pick
  return { mimeType: "", extension: "webm" };
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
): { opacity: number; blur: number; brightness: number; skewX: number; translateX: number } {
  const t = Math.min(1, Math.max(0, enterT));
  switch (kind) {
    case "cut":
      return { opacity: 1, blur: 0, brightness: 1, skewX: 0, translateX: 0 };
    case "dissolve":
      return { opacity: t, blur: 0, brightness: 1, skewX: 0, translateX: 0 };
    case "push":
      return {
        opacity: 0.4 + 0.6 * t,
        blur: 0,
        brightness: 1,
        skewX: 0,
        translateX: (1 - t) * 0.28,
      };
    case "whip":
      return {
        opacity: 0.2 + 0.8 * t,
        blur: (1 - t) * 2,
        brightness: 1,
        skewX: (1 - t) * -6,
        translateX: (1 - t) * 0.6,
      };
    case "light-leak":
      return {
        opacity: Math.min(1, t * 1.4),
        blur: 0,
        brightness: 1 + (1 - t) * 1.2,
        skewX: 0,
        translateX: 0,
      };
    default:
      return { opacity: 1, blur: 0, brightness: 1, skewX: 0, translateX: 0 };
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
    shortEdge = 1080,
    fps = 30,
    onProgress,
    signal,
  } = options;

  if (clips.length === 0) {
    throw new Error("Add at least one clip before exporting video");
  }
  assertNotAborted(signal);

  const { width, height } = canvasSizeForAspect(aspect, shortEdge);
  const { mimeType, extension } = pickRecorderMime();
  const totalDuration = clips.reduce((s, c) => s + c.durationSec, 0);
  const skippedVideos: string[] = [];

  onProgress?.({
    phase: "prepare",
    ratio: 0,
    clipIndex: 0,
    clipCount: clips.length,
    message: "Preparing export…",
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not get 2D canvas context");

  // Warm first frame so the recorder has content immediately
  ctx.fillStyle = theme.palette.bg;
  ctx.fillRect(0, 0, width, height);

  const stream = canvas.captureStream(fps);
  const recorder = mimeType
    ? new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 6_000_000,
      })
    : new MediaRecorder(stream, { videoBitsPerSecond: 6_000_000 });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("MediaRecorder failed during export"));
  });

  const onAbortRecording = () => {
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    for (const t of stream.getTracks()) t.stop();
  };
  signal?.addEventListener("abort", onAbortRecording, { once: true });

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
        const tx = transitionOpacity(theme.transition, enterT);
        const ken =
          clip.kind === "image"
            ? kenBurnsAt(theme.photoMotion, localT)
            : { scale: 1, ox: 0, oy: 0 };

        ctx.save();
        ctx.fillStyle = theme.palette.bg;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalAlpha = tx.opacity;
        if (tx.translateX || tx.skewX) {
          ctx.translate(tx.translateX * width, 0);
          ctx.transform(1, 0, Math.tan((tx.skewX * Math.PI) / 180), 1, 0, 0);
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
          `${theme.transition} · ${theme.motion} · ${i + 1}/${clips.length}`,
        );
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
    for (const t of stream.getTracks()) t.stop();
    signal?.removeEventListener("abort", onAbortRecording);
    throw err;
  }

  for (const t of stream.getTracks()) t.stop();
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
    message: "Done",
  });

  return {
    blob,
    mimeType: outType,
    extension: outType.includes("mp4") ? "mp4" : extension,
    width,
    height,
    durationSec: totalDuration,
    skippedVideos,
  };
}
