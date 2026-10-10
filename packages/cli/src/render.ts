/**
 * Local FFmpeg render — slideshow compose matching web export concepts.
 * Images/videos → scale+pad → optional xfade → title overlay → beat audio mux.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import type {
  Aspect,
  BeatSync,
  CatalogManifest,
  TemplatePack,
  ThemePack,
  TransitionKind,
  VoyajesProject,
} from "@voyajes/core";
import { gradeFfmpeg, parsePackRef, TRANSITION_KINDS } from "@voyajes/core";
import { defaultImageDuration, snapDurationToBeat } from "./beatSync.js";

export type RenderQuality = "720p" | "1080p" | "4k";

export type RenderOptions = {
  project: VoyajesProject;
  projectPath: string;
  out: string;
  quality: RenderQuality;
  /** Override theme pack id (with or without @version) */
  themeOverride?: string;
  beatSyncOverride?: BeatSync;
  titleOverride?: string;
  /** Override audio beat pack id */
  beatOverride?: string;
  catalog: CatalogManifest;
  catalogRoot: string;
};

export type RenderResult = {
  ok: boolean;
  out?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  clips?: number;
  theme?: string;
  beatSync?: BeatSync;
  title?: string;
  audioMuxed?: boolean;
  engine?: "ffmpeg";
  ffmpegVersion?: string;
  message?: string;
  error?: string;
};

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i;

export function findFfmpeg(): string | null {
  try {
    const which = execFileSync("which", ["ffmpeg"], {
      encoding: "utf8",
    }).trim();
    return which || null;
  } catch {
    return null;
  }
}

export function ffmpegInstallHint(): string {
  return [
    "ffmpeg not found on PATH.",
    "Install it, then re-run:",
    "  macOS:   brew install ffmpeg",
    "  Ubuntu:  sudo apt install ffmpeg",
    "  Windows: winget install ffmpeg  (or choco install ffmpeg)",
    "Verify:   which ffmpeg && ffmpeg -version",
  ].join("\n");
}

export function ffmpegVersionLine(bin: string): string {
  try {
    const out = execFileSync(bin, ["-version"], { encoding: "utf8" });
    return out.split("\n")[0] ?? "ffmpeg";
  } catch {
    return "ffmpeg";
  }
}

function aspectSize(
  aspect: Aspect,
  quality: RenderQuality,
): { width: number; height: number } {
  const short = quality === "720p" ? 720 : quality === "4k" ? 2160 : 1080;
  if (aspect === "16:9")
    return { width: Math.round((short * 16) / 9), height: short };
  if (aspect === "1:1") return { width: short, height: short };
  if (aspect === "4:5")
    return { width: short, height: Math.round((short * 5) / 4) };
  return { width: short, height: Math.round((short * 16) / 9) };
}

function resolveMediaPath(clipPath: string, projectDir: string): string {
  if (isAbsolute(clipPath)) return clipPath;
  return resolve(projectDir, clipPath);
}

function isImage(path: string): boolean {
  return IMAGE_EXT.test(path);
}

function isVideo(path: string): boolean {
  return VIDEO_EXT.test(path);
}

export function findTheme(
  catalog: CatalogManifest,
  refOrId: string,
): ThemePack | undefined {
  let id = refOrId;
  try {
    id = parsePackRef(refOrId).id;
  } catch {
    /* bare id ok */
  }
  return catalog.packs.find(
    (p) => p.id === id && p.kind === "theme",
  ) as ThemePack | undefined;
}

export function findTemplate(
  catalog: CatalogManifest,
  refOrId: string,
): TemplatePack | undefined {
  let id = refOrId;
  try {
    id = parsePackRef(refOrId).id;
  } catch {
    /* bare id ok */
  }
  return catalog.packs.find(
    (p) => p.id === id && p.kind === "template",
  ) as TemplatePack | undefined;
}

export function parseTransitionKind(value: string): TransitionKind | null {
  if ((TRANSITION_KINDS as string[]).includes(value)) {
    return value as TransitionKind;
  }
  return null;
}

export function findBeat(
  catalog: CatalogManifest,
  refOrId?: string,
):
  | {
      id: string;
      version: string;
      name?: string;
      bpm: number;
      previewUrl?: string;
    }
  | undefined {
  const pick = (id: string) => {
    const pack = catalog.packs.find(
      (p) => p.id === id && p.kind === "audio-beat",
    );
    if (!pack || pack.kind !== "audio-beat") return undefined;
    return pack as {
      id: string;
      version: string;
      name?: string;
      bpm: number;
      previewUrl?: string;
    };
  };

  if (!refOrId) {
    const first = catalog.packs.find((p) => p.kind === "audio-beat");
    return first && first.kind === "audio-beat"
      ? (first as {
          id: string;
          version: string;
          name?: string;
          bpm: number;
          previewUrl?: string;
        })
      : undefined;
  }
  let id = refOrId;
  try {
    id = parsePackRef(refOrId).id;
  } catch {
    /* bare */
  }
  return pick(id);
}

/** Resolve catalog preview MP3 to a local file under catalog/previews/ */
export function resolveBeatAudioFile(
  catalogRoot: string,
  previewUrl?: string,
  beatId?: string,
): string | null {
  const candidates: string[] = [];
  if (previewUrl) {
    const name = basename(previewUrl);
    candidates.push(join(catalogRoot, "previews", name));
    candidates.push(join(catalogRoot, name));
    const stripped = previewUrl.replace(/^\/?catalog\//, "");
    candidates.push(join(catalogRoot, stripped));
  }
  if (beatId) {
    const short = beatId.replace(/^audio\./, "").replace(/-\d+$/, "");
    candidates.push(join(catalogRoot, "previews", `${short}.mp3`));
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function xfadeName(kind: TransitionKind): string {
  switch (kind) {
    case "dissolve":
      return "fade";
    case "push":
      return "slideleft";
    case "whip":
      return "wipeleft";
    case "light-leak":
      return "fadewhite";
    case "fade-black":
      return "fadeblack";
    case "zoom-through":
      return "distance";
    case "slide-up":
      return "slidedown"; // incoming slides up from below (xfade naming)
    case "flash":
      return "fadewhite";
    case "slide-left":
      return "slideright"; // incoming from left
    case "slide-right":
      return "slideleft";
    case "circle-wipe":
      return "circlecrop";
    case "blur-fade":
      return "fade";
    case "spin":
      return "radial";
    case "glitch":
      return "pixelize";
    case "heart-wipe":
      return "horzopen";
    case "soft-bloom":
      return "fadewhite";
    case "cut":
    default:
      return "fade";
  }
}

function gradeFilter(grade?: string): string {
  // colorbalance uses r/g/b × shadows(s) midtones(m) highlights(h) — e.g. rm, gs, bh
  switch (grade) {
    case "magenta-crush":
      return "eq=saturation=1.25:contrast=1.05,colorbalance=rs=0.06:rm=0.1:bs=-0.05:bm=-0.04";
    case "warm-halation":
      return "eq=saturation=1.1:contrast=1.02,colorbalance=rs=0.1:rm=0.08:gs=0.03:gm=0.04:bs=-0.06:bm=-0.05";
    case "teal-pop":
      return "eq=saturation=1.15:contrast=1.04,colorbalance=rs=-0.04:rm=-0.03:gs=0.05:gm=0.06:bs=0.08:bm=0.06";
    case "golden-hour":
      return "eq=saturation=1.12:contrast=1.03,colorbalance=rs=0.12:rm=0.1:gs=0.05:gm=0.04:bs=-0.1:bm=-0.08";
    case "vhs-crush":
      return "eq=saturation=1.35:contrast=1.08,colorbalance=rs=0.08:rm=0.12:gs=-0.04:gm=-0.02:bs=0.06:bm=0.08";
    case "clean-lift":
      return "eq=saturation=0.95:contrast=1.02:brightness=0.03";
    case "lime-crush":
      return "eq=saturation=1.3:contrast=1.1,colorbalance=rs=-0.06:rm=-0.05:gs=0.12:gm=0.14:bs=-0.08:bm=-0.06";
    case "rose-mist":
      return "eq=saturation=1.08:contrast=0.98,colorbalance=rs=0.08:rm=0.1:gs=-0.02:gm=0.02:bs=0.04:bm=0.05";
    case "doc-grain":
      return "eq=saturation=0.85:contrast=1.06:gamma=1.05,colorbalance=rs=0.04:rm=0.03:gs=0.02:gm=0.02:bs=-0.04:bm=-0.03";
    case "strobe-pop":
      return "eq=saturation=1.4:contrast=1.12,colorbalance=rs=0.1:rm=0.14:gs=-0.05:gm=-0.04:bs=0.08:bm=0.1";
    default:
      return "eq=saturation=1.05";
  }
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

type PreparedClip = {
  absPath: string;
  kind: "image" | "video";
  durationSec: number;
  transitionOut?: import("@voyajes/core").TransitionKind;
  /** v2: trim in-point (video) */
  inSec?: number;
  /** v2: per-edge transition duration (gap after this clip) */
  txSec?: number;
};

function prepareClips(
  project: VoyajesProject,
  projectDir: string,
  theme: ThemePack,
  beatSync: BeatSync,
  bpm: number,
): PreparedClip[] {
  const clips: PreparedClip[] = [];
  for (const m of project.media) {
    const abs = resolveMediaPath(m.path, projectDir);
    if (!existsSync(abs)) {
      throw new Error(`Media not found: ${m.path} (resolved ${abs})`);
    }
    let kind: "image" | "video";
    if (isVideo(abs)) kind = "video";
    else if (isImage(abs)) kind = "image";
    else throw new Error(`Unsupported media type: ${m.path}`);

    let duration =
      m.durationSec ??
      (kind === "image" ? defaultImageDuration(theme.motion) : 4);

    if (kind === "image" && beatSync !== "off") {
      duration = snapDurationToBeat(duration, bpm, beatSync);
    }
    const minHold = Math.max(
      0.8,
      (theme.transitionDurationMs / 1000) * 2 + 0.2,
    );
    duration = Math.max(duration, minHold);
    clips.push({
      absPath: abs,
      kind,
      durationSec: duration,
      transitionOut: m.transitionOut,
      inSec: kind === "video" && m.inSec ? m.inSec : undefined,
      txSec: m.transitionSpec?.durationSec ?? project.transitionSpec?.durationSec,
    });
  }
  // Explicit transitionEdges win over media[].transitionOut when both set
  if (project.transitionEdges?.length) {
    for (const edge of project.transitionEdges) {
      const clip = clips[edge.afterIndex];
      if (clip) clip.transitionOut = edge.kind;
    }
  }
  return clips;
}

function runFfmpeg(
  bin: string,
  args: string[],
): { status: number; stderr: string } {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stderr: `${result.stderr ?? ""}${result.stdout ?? ""}`,
  };
}

function buildVideoFilters(
  clips: PreparedClip[],
  theme: ThemePack,
  width: number,
  height: number,
  fps: number,
  txSec: number,
  useXfade: boolean,
  title: string | null,
  defaultTransition?: import("@voyajes/core").TransitionKind,
  textOverlays?: Array<{
    at: number;
    end?: number;
    value: string;
    color?: string;
    position?: string;
  }>,
  projectGrade?: import("@voyajes/core").GradePreset,
): { filterComplex: string; outputLabel: string; totalDuration: number } {
  const grade =
    gradeFilter(theme.palette.grade) +
    (projectGrade && gradeFfmpeg(projectGrade) ? `,${gradeFfmpeg(projectGrade)}` : "");
  const parts: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    parts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p,${grade}[v${i}]`,
    );
  }

  let composed = "v0";
  let totalDuration = clips.reduce((s, c) => s + c.durationSec, 0);

  if (clips.length > 1) {
    if (useXfade) {
      let prev = "v0";
      let cumulative = clips[0].durationSec;
      let overlap = 0;
      for (let i = 1; i < clips.length; i++) {
        const out = i === clips.length - 1 ? "vx" : `xf${i}`;
        // Per-edge transition object duration (timeline v2), clamped to clip lengths
        const edgeSec = Math.max(
          0.1,
          Math.min(
            clips[i - 1].txSec ?? txSec,
            clips[i - 1].durationSec * 0.8,
            clips[i].durationSec * 0.8,
          ),
        );
        overlap += edgeSec;
        const offset = Math.max(0, cumulative - edgeSec);
        const edgeKind =
          clips[i - 1].transitionOut ??
          defaultTransition ??
          theme.transition;
        const name = xfadeName(edgeKind);
        parts.push(
          `[${prev}][v${i}]xfade=transition=${name}:duration=${edgeSec.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`,
        );
        cumulative = offset + clips[i].durationSec;
        prev = out;
      }
      composed = "vx";
      totalDuration -= overlap;
    } else {
      const concatIn = clips.map((_, i) => `[v${i}]`).join("");
      parts.push(`${concatIn}concat=n=${clips.length}:v=1:a=0[vx]`);
      composed = "vx";
    }
  }

  let label = composed;
  let layer = 0;
  const pushDraw = (
    text: string,
    yExpr: string,
    color: string,
    enable?: string,
  ) => {
    const titleEsc = escapeDrawtext(text);
    const fontsize = Math.max(28, Math.round(width / 18));
    const next = `dt${layer++}`;
    const enableExpr = enable ? `:enable='${enable}'` : "";
    parts.push(
      `[${label}]drawtext=text='${titleEsc}':` +
        `fontsize=${fontsize}:` +
        `fontcolor=${color}:borderw=2:bordercolor=black@0.45:` +
        `x=(w-text_w)/2:y=${yExpr}:shadowcolor=black@0.5:shadowx=2:shadowy=2${enableExpr}[${next}]`,
    );
    label = next;
  };

  if (title && title.trim()) {
    pushDraw(title.trim(), "h*0.08", "white@0.92");
  }

  if (textOverlays?.length) {
    for (const o of textOverlays) {
      if (!o.value?.trim()) continue;
      const start = Math.max(0, o.at);
      const end =
        typeof o.end === "number" ? o.end : start + Math.max(1, totalDuration);
      const y =
        o.position === "center"
          ? "(h-text_h)/2"
          : o.position === "bottom" || o.position === "lower-third"
            ? "h*0.82"
            : "h*0.08";
      const color = (o.color || "#ffffff").replace("#", "0x") + "@0.92";
      pushDraw(
        o.value.trim(),
        y,
        color,
        `between(t\,${start.toFixed(3)}\,${end.toFixed(3)})`,
      );
    }
  }

  return {
    filterComplex: parts.join(";"),
    outputLabel: label,
    totalDuration,
  };
}

/**
 * Build and run the FFmpeg slideshow pipeline.
 */
export function renderWithFfmpeg(opts: RenderOptions): RenderResult {
  const bin = findFfmpeg();
  if (!bin) {
    return {
      ok: false,
      error: "ffmpeg_missing",
      message: ffmpegInstallHint(),
    };
  }

  const projectDir = dirname(resolve(opts.projectPath));
  const title = opts.titleOverride ?? opts.project.title;

  let themeRef = opts.project.theme;
  if (opts.themeOverride) {
    const t = findTheme(opts.catalog, opts.themeOverride);
    if (!t) {
      return {
        ok: false,
        error: "theme_not_found",
        message: `Theme not found: ${opts.themeOverride}`,
      };
    }
    themeRef = `${t.id}@${t.version}`;
  }
  const theme = findTheme(opts.catalog, themeRef);
  if (!theme) {
    return {
      ok: false,
      error: "theme_not_found",
      message: `Theme not in catalog: ${themeRef}. Run: voyajes sync`,
    };
  }

  const beatSync: BeatSync =
    opts.beatSyncOverride ?? opts.project.audio?.beatSync ?? "medium";

  const beatRef =
    opts.beatOverride ?? opts.project.audio?.track ?? "audio.warm-acoustic-092";
  const isCustomBeat = typeof beatRef === "string" && beatRef.startsWith("custom:");
  const beat = isCustomBeat ? undefined : findBeat(opts.catalog, beatRef);
  const bpm = beat?.bpm ?? 92;

  if (!opts.project.media.length) {
    return {
      ok: false,
      error: "no_media",
      message:
        "Project has no media clips. Drop images/videos into the media/ folder and re-run `voyajes init <folder>`, or edit the project JSON paths.",
    };
  }

  let clips: PreparedClip[];
  try {
    clips = prepareClips(opts.project, projectDir, theme, beatSync, bpm);
  } catch (e) {
    return {
      ok: false,
      error: "media_resolve",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const { width, height } = aspectSize(opts.project.aspect, opts.quality);
  const fps = 30;
  const txSec = Math.min(
    0.8,
    Math.max(0.12, theme.transitionDurationMs / 1000),
  );
  const defaultTransition = opts.project.transition ?? theme.transition;
  const anyEdgeTransition = clips.some(
    (c) => c.transitionOut && c.transitionOut !== "cut",
  );
  const useXfade =
    (defaultTransition !== "cut" || anyEdgeTransition) && clips.length > 1;

  const outAbs = resolve(opts.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  const ext = extname(outAbs).toLowerCase();
  const wantWebm = ext === ".webm";

  const work = mkdtempSync(join(tmpdir(), "voyajes-render-"));
  let audioFile: string | null = null;
  if (isCustomBeat) {
    const customId = beatRef.slice("custom:".length);
    const custom = opts.project.audio?.customSounds?.find((s) => s.id === customId);
    if (custom?.path) {
      const abs = resolveMediaPath(custom.path, projectDir);
      if (existsSync(abs)) audioFile = abs;
    }
    if (!audioFile && custom?.url && custom.url.startsWith("file:")) {
      /* ignore */
    }
    if (!audioFile && custom?.url && !custom.url.startsWith("http")) {
      const abs = resolveMediaPath(custom.url, projectDir);
      if (existsSync(abs)) audioFile = abs;
    }
  } else {
    audioFile = resolveBeatAudioFile(
      opts.catalogRoot,
      beat?.previewUrl,
      beat?.id,
    );
  }
  const ducking = opts.project.audio?.ducking !== false;
  const audioVolume = ducking ? 0.72 : 0.9;

  try {
    const inputArgs: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
    for (const c of clips) {
      if (c.kind === "image") {
        inputArgs.push(
          "-loop",
          "1",
          "-t",
          String(c.durationSec),
          "-i",
          c.absPath,
        );
      } else {
        if (c.inSec) inputArgs.push("-ss", String(c.inSec));
        inputArgs.push("-t", String(c.durationSec), "-i", c.absPath);
      }
    }

    let audioInputIndex = -1;
    if (audioFile) {
      audioInputIndex = clips.length;
      inputArgs.push("-stream_loop", "-1", "-i", audioFile);
    }

    const encodeArgs: string[] = [];
    if (wantWebm) {
      encodeArgs.push(
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "2M",
        "-row-mt",
        "1",
        "-pix_fmt",
        "yuv420p",
      );
      if (audioInputIndex >= 0) {
        encodeArgs.push("-c:a", "libopus", "-b:a", "128k");
      } else {
        encodeArgs.push("-an");
      }
    } else {
      encodeArgs.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
      );
      if (audioInputIndex >= 0) {
        encodeArgs.push("-c:a", "aac", "-b:a", "160k");
      } else {
        encodeArgs.push("-an");
      }
    }

    const attempt = (withTitle: boolean): { status: number; stderr: string; totalDuration: number; outputLabel: string } => {
      const overlays = (opts.project.text ?? [])
        .filter((t) => t.role !== "title" || t.at > 0 || t.end != null)
        .map((t) => ({
          at: t.at,
          end: t.end,
          value: t.value,
          color: t.color,
          position: t.position,
        }));
      const built = buildVideoFilters(
        clips,
        theme,
        width,
        height,
        fps,
        txSec,
        useXfade,
        withTitle ? title : null,
        defaultTransition,
        overlays,
        opts.project.grade,
      );
      writeFileSync(join(work, withTitle ? "filter.txt" : "filter-notitle.txt"), built.filterComplex + "\n");

      const mapArgs = [
        "-filter_complex",
        built.filterComplex,
        "-map",
        `[${built.outputLabel}]`,
      ];
      if (audioInputIndex >= 0) {
        mapArgs.push(
          "-map",
          `${audioInputIndex}:a:0`,
          "-filter:a",
          `volume=${audioVolume}`,
          "-t",
          String(built.totalDuration),
          "-shortest",
        );
      } else {
        mapArgs.push("-t", String(built.totalDuration));
      }

      const args = [...inputArgs, ...mapArgs, ...encodeArgs, outAbs];
      const result = runFfmpeg(bin, args);
      return { ...result, totalDuration: built.totalDuration, outputLabel: built.outputLabel };
    };

    let result = attempt(true);
    if ((result.status !== 0 || !existsSync(outAbs)) && /Cannot find a valid font|Fontconfig error|error initializing filter 'drawtext'|No such filter: 'drawtext'/i.test(result.stderr)) {
      console.error("⚠  drawtext unavailable — retrying without title overlay");
      result = attempt(false);
    }

    if (result.status !== 0 || !existsSync(outAbs)) {
      return {
        ok: false,
        error: "ffmpeg_failed",
        message: `ffmpeg failed:\n${result.stderr.slice(-2000)}`,
      };
    }

    return {
      ok: true,
      out: outAbs,
      width,
      height,
      durationSec: Math.round(result.totalDuration * 1000) / 1000,
      clips: clips.length,
      theme: themeRef,
      beatSync,
      title,
      audioMuxed: audioInputIndex >= 0,
      engine: "ffmpeg",
      ffmpegVersion: ffmpegVersionLine(bin),
      message:
        audioInputIndex >= 0
          ? `Wrote ${outAbs} with beat audio (${beat?.name ?? beatRef})`
          : `Wrote ${outAbs} (video only — no beat preview file found)`,
    };
  } finally {
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Generate solid-color sample PNGs via ffmpeg for init demos. */
export function generateSampleImages(
  mediaDir: string,
  colors: Array<{ name: string; color: string }>,
): string[] {
  const bin = findFfmpeg();
  mkdirSync(mediaDir, { recursive: true });
  const paths: string[] = [];
  if (!bin) return paths;
  for (const { name, color } of colors) {
    const out = join(mediaDir, name);
    const r = runFfmpeg(bin, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=1080x1920:d=1`,
      "-frames:v",
      "1",
      out,
    ]);
    if (r.status === 0 && existsSync(out)) paths.push(out);
  }
  return paths;
}
