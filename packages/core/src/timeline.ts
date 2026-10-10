/**
 * Voyajes timeline model (schema v2) — pro-editor primitives shared by
 * Create preview, WebM/GIF export, share playback and the CLI renderer.
 *
 * Everything here is pure math so the same numbers drive every surface.
 */
import { z } from "zod";

export const EasingSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "back-out",
  "bounce",
]);
export type Easing = z.infer<typeof EasingSchema>;
export const EASINGS: Easing[] = EasingSchema.options;

export const TRANSITION_MIN_SEC = 0.2;
export const TRANSITION_MAX_SEC = 2;

export function clampTransitionSec(sec: number): number {
  if (!Number.isFinite(sec)) return 0.5;
  return Math.min(TRANSITION_MAX_SEC, Math.max(TRANSITION_MIN_SEC, sec));
}

/** CSS cubic-bezier equivalents for preview */
export function easingCss(e: Easing | undefined): string {
  switch (e) {
    case "linear":
      return "linear";
    case "ease-in":
      return "cubic-bezier(0.42,0,1,1)";
    case "ease-out":
      return "cubic-bezier(0,0,0.58,1)";
    case "back-out":
      return "cubic-bezier(0.34,1.56,0.64,1)";
    case "bounce":
      return "cubic-bezier(0.68,-0.55,0.27,1.55)";
    case "ease-in-out":
    default:
      return "cubic-bezier(0.42,0,0.58,1)";
  }
}

export function ease(e: Easing | undefined, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (e) {
    case "linear":
      return x;
    case "ease-in":
      return x * x * x;
    case "ease-out":
      return 1 - Math.pow(1 - x, 3);
    case "back-out": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case "bounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      let y = x;
      if (y < 1 / d1) return n1 * y * y;
      if (y < 2 / d1) return n1 * (y -= 1.5 / d1) * y + 0.75;
      if (y < 2.5 / d1) return n1 * (y -= 2.25 / d1) * y + 0.9375;
      return n1 * (y -= 2.625 / d1) * y + 0.984375;
    }
    case "ease-in-out":
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

/** In / out animation presets (clip or text layer) */
export const AnimPresetSchema = z.enum([
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-in",
  "zoom-out",
  "pop",
  "spin",
  "blur",
]);
export type AnimPreset = z.infer<typeof AnimPresetSchema>;
export const ANIM_PRESETS: AnimPreset[] = AnimPresetSchema.options;

/** Looping / whole-clip emphasis presets */
export const EmphasisPresetSchema = z.enum([
  "none",
  "ken-burns",
  "ken-burns-out",
  "pulse",
  "float",
  "shake",
  "sway",
]);
export type EmphasisPreset = z.infer<typeof EmphasisPresetSchema>;
export const EMPHASIS_PRESETS: EmphasisPreset[] = EmphasisPresetSchema.options;

export const ClipAnimationSchema = z.object({
  in: AnimPresetSchema.optional(),
  out: AnimPresetSchema.optional(),
  emphasis: EmphasisPresetSchema.optional(),
  /** seconds for in/out (default 0.5) */
  inSec: z.number().positive().max(5).optional(),
  outSec: z.number().positive().max(5).optional(),
});
export type ClipAnimation = z.infer<typeof ClipAnimationSchema>;

/** Keyframe at clip-local time `t` seconds. Missing props = untouched. */
export const KeyframeSchema = z.object({
  t: z.number().nonnegative(),
  /** fraction of frame width/height (−1..1) */
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().positive().optional(),
  /** degrees */
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  easing: EasingSchema.optional(),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const TransitionSpecSchema = z.object({
  durationSec: z.number().min(TRANSITION_MIN_SEC).max(TRANSITION_MAX_SEC).optional(),
  easing: EasingSchema.optional(),
});
export type TransitionSpec = z.infer<typeof TransitionSpecSchema>;

/** Color grade presets (LUT-like CSS/canvas filter) */
export const GradePresetSchema = z.enum([
  "none",
  "vivid",
  "warm",
  "cool",
  "teal-orange",
  "film",
  "mono",
  "dreamy",
  "neon",
]);
export type GradePreset = z.infer<typeof GradePresetSchema>;
export const GRADE_PRESETS: GradePreset[] = GradePresetSchema.options;

/** CSS / canvas 2D filter string (both accept the same syntax) */
export function gradeFilter(g: GradePreset | undefined): string {
  switch (g) {
    case "vivid":
      return "saturate(1.35) contrast(1.08)";
    case "warm":
      return "sepia(0.18) saturate(1.2) hue-rotate(-8deg)";
    case "cool":
      return "saturate(1.05) hue-rotate(12deg) brightness(1.03)";
    case "teal-orange":
      return "contrast(1.12) saturate(1.25) sepia(0.12) hue-rotate(-4deg)";
    case "film":
      return "contrast(0.92) sepia(0.22) saturate(0.9) brightness(1.04)";
    case "mono":
      return "grayscale(1) contrast(1.1)";
    case "dreamy":
      return "brightness(1.08) saturate(1.15) contrast(0.9)";
    case "neon":
      return "saturate(1.7) contrast(1.15) hue-rotate(-12deg)";
    default:
      return "none";
  }
}

/** ffmpeg eq/hue approximation for the CLI */
export function gradeFfmpeg(g: GradePreset | undefined): string | null {
  switch (g) {
    case "vivid":
      return "eq=saturation=1.35:contrast=1.08";
    case "warm":
      return "colorbalance=rs=0.08:bs=-0.08,eq=saturation=1.15";
    case "cool":
      return "colorbalance=rs=-0.06:bs=0.08";
    case "teal-orange":
      return "colorbalance=rs=0.1:bs=0.08:rh=0.08:bh=-0.08,eq=contrast=1.1:saturation=1.2";
    case "film":
      return "eq=contrast=0.92:saturation=0.85:brightness=0.02";
    case "mono":
      return "hue=s=0,eq=contrast=1.1";
    case "dreamy":
      return "eq=brightness=0.05:saturation=1.15:contrast=0.9";
    case "neon":
      return "eq=saturation=1.7:contrast=1.15";
    default:
      return null;
  }
}

export type Transform2D = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  blur: number;
};

export const IDENTITY: Transform2D = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  blur: 0,
};

export function composeTransforms(a: Transform2D, b: Transform2D): Transform2D {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    scale: a.scale * b.scale,
    rotation: a.rotation + b.rotation,
    opacity: a.opacity * b.opacity,
    blur: a.blur + b.blur,
  };
}

/** p=0 → fully "away", p=1 → at rest */
function presetAt(preset: AnimPreset | undefined, p: number): Transform2D {
  const q = 1 - p;
  switch (preset) {
    case "fade":
      return { ...IDENTITY, opacity: p };
    case "slide-left":
      return { ...IDENTITY, x: q * 0.35, opacity: Math.min(1, p * 1.5) };
    case "slide-right":
      return { ...IDENTITY, x: -q * 0.35, opacity: Math.min(1, p * 1.5) };
    case "slide-up":
      return { ...IDENTITY, y: q * 0.3, opacity: Math.min(1, p * 1.5) };
    case "slide-down":
      return { ...IDENTITY, y: -q * 0.3, opacity: Math.min(1, p * 1.5) };
    case "zoom-in":
      return { ...IDENTITY, scale: 0.6 + 0.4 * p, opacity: p };
    case "zoom-out":
      return { ...IDENTITY, scale: 1 + 0.5 * q, opacity: p };
    case "pop":
      return { ...IDENTITY, scale: Math.max(0.01, p), opacity: Math.min(1, p * 2) };
    case "spin":
      return { ...IDENTITY, rotation: q * -180, scale: 0.5 + 0.5 * p, opacity: p };
    case "blur":
      return { ...IDENTITY, blur: q * 14, opacity: p };
    default:
      return IDENTITY;
  }
}

function emphasisAt(e: EmphasisPreset | undefined, localSec: number, u: number): Transform2D {
  switch (e) {
    case "ken-burns":
      return { ...IDENTITY, scale: 1 + 0.12 * u, x: -0.02 * u, y: -0.015 * u };
    case "ken-burns-out":
      return { ...IDENTITY, scale: 1.12 - 0.12 * u, x: 0.02 * u };
    case "pulse":
      return { ...IDENTITY, scale: 1 + 0.04 * Math.sin(localSec * Math.PI * 2) };
    case "float":
      return { ...IDENTITY, y: 0.015 * Math.sin(localSec * Math.PI) };
    case "shake":
      return {
        ...IDENTITY,
        x: 0.008 * Math.sin(localSec * 40),
        y: 0.006 * Math.cos(localSec * 33),
      };
    case "sway":
      return { ...IDENTITY, rotation: 2.5 * Math.sin(localSec * Math.PI) };
    default:
      return IDENTITY;
  }
}

/** Transform from in/out/emphasis presets at clip-local time. */
export function animationAt(
  anim: ClipAnimation | undefined,
  localSec: number,
  durationSec: number,
): Transform2D {
  if (!anim) return IDENTITY;
  const dur = Math.max(0.01, durationSec);
  let t = emphasisAt(anim.emphasis, localSec, Math.min(1, Math.max(0, localSec / dur)));
  if (anim.in && anim.in !== "none") {
    const d = Math.min(anim.inSec ?? 0.5, dur / 2);
    if (localSec < d) t = composeTransforms(t, presetAt(anim.in, ease("ease-out", localSec / d)));
  }
  if (anim.out && anim.out !== "none") {
    const d = Math.min(anim.outSec ?? 0.5, dur / 2);
    const rem = dur - localSec;
    if (rem < d) t = composeTransforms(t, presetAt(anim.out, ease("ease-in", Math.max(0, rem) / d)));
  }
  return t;
}

const KF_PROPS = ["x", "y", "scale", "rotation", "opacity"] as const;

/** Interpolate keyframes per property (each property tracks its own keys). */
export function keyframesAt(keys: Keyframe[] | undefined, localSec: number): Transform2D {
  if (!keys || keys.length === 0) return IDENTITY;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const out: Transform2D = { ...IDENTITY };
  for (const prop of KF_PROPS) {
    const ks = sorted.filter((k) => typeof k[prop] === "number");
    if (ks.length === 0) continue;
    let v: number;
    if (localSec <= ks[0].t) v = ks[0][prop] as number;
    else if (localSec >= ks[ks.length - 1].t) v = ks[ks.length - 1][prop] as number;
    else {
      let i = 0;
      while (i < ks.length - 1 && ks[i + 1].t < localSec) i++;
      const a = ks[i];
      const b = ks[i + 1];
      const span = Math.max(1e-6, b.t - a.t);
      const p = ease(b.easing ?? "ease-in-out", (localSec - a.t) / span);
      v = (a[prop] as number) + ((b[prop] as number) - (a[prop] as number)) * p;
    }
    out[prop] = v;
  }
  return out;
}

/** Full per-clip/per-layer transform: animation presets ∘ keyframes */
export function layerTransformAt(
  anim: ClipAnimation | undefined,
  keys: Keyframe[] | undefined,
  localSec: number,
  durationSec: number,
): Transform2D {
  return composeTransforms(animationAt(anim, localSec, durationSec), keyframesAt(keys, localSec));
}

/** CSS transform string for preview (x/y as % of container) */
export function transformCss(t: Transform2D): string {
  return `translate(${(t.x * 100).toFixed(2)}%, ${(t.y * 100).toFixed(2)}%) scale(${t.scale.toFixed(4)}) rotate(${t.rotation.toFixed(2)}deg)`;
}

/** Apply to a canvas 2D context around the frame centre */
export function applyTransformToCanvas(
  ctx: {
    translate(x: number, y: number): void;
    scale(x: number, y: number): void;
    rotate(a: number): void;
    globalAlpha: number;
  },
  t: Transform2D,
  w: number,
  h: number,
): void {
  ctx.translate(w / 2 + t.x * w, h / 2 + t.y * h);
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
  if (t.scale !== 1) ctx.scale(t.scale, t.scale);
  ctx.translate(-w / 2, -h / 2);
  ctx.globalAlpha *= Math.max(0, Math.min(1, t.opacity));
}

/** Upsert a keyframe at time t (merging props). */
export function upsertKeyframe(
  keys: Keyframe[] | undefined,
  t: number,
  props: Partial<Omit<Keyframe, "t">>,
  epsilon = 0.04,
): Keyframe[] {
  const list = [...(keys ?? [])];
  const i = list.findIndex((k) => Math.abs(k.t - t) <= epsilon);
  if (i >= 0) list[i] = { ...list[i], ...props };
  else list.push({ t: Math.max(0, Math.round(t * 100) / 100), ...props });
  return list.sort((a, b) => a.t - b.t);
}

export type TimelineClipLike = {
  durationSec: number;
};

/** Start offsets of each clip on the (sequential) timeline. */
export function clipStarts(clips: TimelineClipLike[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const c of clips) {
    out.push(acc);
    acc += c.durationSec;
  }
  return out;
}

/** Map a global time to (clip index, local seconds). */
export function locateTime(
  clips: TimelineClipLike[],
  timeSec: number,
): { index: number; local: number } {
  if (clips.length === 0) return { index: 0, local: 0 };
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const d = clips[i].durationSec;
    if (timeSec < acc + d || i === clips.length - 1) {
      return { index: i, local: Math.max(0, Math.min(d, timeSec - acc)) };
    }
    acc += d;
  }
  return { index: clips.length - 1, local: 0 };
}

export const CURRENT_SCHEMA = 2 as const;

/**
 * Upgrade any older project JSON (schema 1 or missing) to schema 2.
 * v1 → v2 is additive: v2 fields are optional, so this just stamps the
 * version and normalises legacy transitionEdges into media[].transitionOut.
 */
export function migrateProject(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const p = { ...(data as Record<string, unknown>) };
  const v = typeof p.schema === "number" ? p.schema : 1;
  if (v >= 2) return p;
  const media = Array.isArray(p.media) ? (p.media as Record<string, unknown>[]).map((m) => ({ ...m })) : [];
  const edges = Array.isArray(p.transitionEdges)
    ? (p.transitionEdges as { afterIndex: number; kind: string }[])
    : [];
  for (const e of edges) {
    if (media[e.afterIndex] && !media[e.afterIndex].transitionOut) {
      media[e.afterIndex].transitionOut = e.kind;
    }
  }
  p.media = media;
  p.schema = 2;
  return p;
}
