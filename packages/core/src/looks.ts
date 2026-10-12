/**
 * v0.8 Theme looks — the "heart" of a Voyajes theme, shared by the web
 * preview, the canvas exports (MP4/WebM/GIF), share playback and the CLI.
 *
 * A look is pure data + pure functions:
 *  - grade      parametric colour grade → CSS/canvas filter and ffmpeg chain
 *  - fx         film look (grain, vignette, light leaks, glow, duotone,
 *               VHS scanlines, chromatic glitch bars, letterbox)
 *  - particles  confetti / neon sparks / bokeh / sun flares / snow / hearts
 *  - music, transitions, clip motion, text style/colour, intro/outro cards,
 *    guest-page background
 * `fxOps()` turns (look, intensity, time) into a list of deterministic draw
 * ops; the web executes them on a 2D canvas, the CLI rasterises the same ops
 * in `rasterizeFx()` — so every renderer draws the same frame.
 */
import type { TransitionKind, TextStyleKind, TextTransitionKind } from "./themes.js";
import type { ClipAnimation, Easing } from "./timeline.js";

export type ParticleKind = "confetti" | "sparks" | "bokeh" | "flares" | "snow" | "hearts" | "stars" | "none";

export interface LookGrade {
  saturate?: number;
  contrast?: number;
  brightness?: number;
  sepia?: number;
  hue?: number;
  grayscale?: number;
}

export interface LookFx {
  grain?: number;
  vignette?: number;
  leak?: { colors: string[]; strength: number };
  glow?: { color: string; strength: number };
  duotone?: { dark: string; light: string; strength: number };
  scanlines?: number;
  glitch?: number;
  letterbox?: number;
  /** white flash on the beat (every 2 beats of the theme track) */
  strobe?: number;
}

export interface ThemeLook {
  id: string;
  name: string;
  vibe: string;
  emoji: string;
  accent: string;
  grade: LookGrade;
  fx: LookFx;
  particles: { kind: ParticleKind; colors: string[]; density: number };
  /** audio clip ref ("lib:<id>" or catalog beat pack ref) + display name + bpm */
  music: { ref: string; name: string; bpm: number };
  /** cycled across cuts */
  transitions: TransitionKind[];
  transitionSec: number;
  easing: Easing;
  /** cycled across clips */
  motions: ClipAnimation[];
  /** beats per shot (before the pace of the story length) */
  beatsPerShot: number;
  text: { style: TextStyleKind; color: string; anim: TextTransitionKind; captionStyle: TextStyleKind; /** v0.9 beat-synced caption motion for Breeze captions */ captionAnim?: TextTransitionKind };
  intro: string;
  outro: string;
  /** guest page / stage background */
  bg: [string, string, string];
}

const kb = (emphasis: ClipAnimation["emphasis"], extra: Partial<ClipAnimation> = {}): ClipAnimation => ({ emphasis, ...extra });

export const THEME_LOOKS: ThemeLook[] = [
  {
    id: "theme.neon-night",
    name: "Neon Night",
    vibe: "Magenta glow, whip cuts, city after dark",
    emoji: "🌃",
    accent: "#E84AFF",
    grade: { saturate: 1.9, contrast: 1.32, brightness: 0.88, hue: -18 },
    fx: { glow: { color: "#E84AFF", strength: 0.45 }, vignette: 0.75, grain: 0.15, glitch: 0.3, leak: { colors: ["#ff2fd6", "#3a7bff"], strength: 0.3 }, strobe: 0.15 },
    particles: { kind: "sparks", colors: ["#ff4fe0", "#6be3ff", "#ffffff"], density: 0.8 },
    music: { ref: "audio.neon-pulse-118@1.0.0", name: "Neon Pulse", bpm: 118 },
    transitions: ["whip", "glitch", "zoom-through", "flash"],
    transitionSec: 0.3,
    easing: "ease-out",
    motions: [kb("ken-burns", { in: "zoom-out", inSec: 0.35 }), kb("pulse"), kb("ken-burns-out", { in: "slide-left", inSec: 0.3 })],
    beatsPerShot: 4,
    text: { style: "kinetic-outline", color: "#FF6BF0", anim: "flash-in", captionStyle: "mono-tech", captionAnim: "karaoke" },
    intro: "AFTER DARK ✦",
    outro: "see you at night ✦",
    bg: ["#0A0614", "#2a0b45", "#E84AFF"],
  },
  {
    id: "theme.golden-hour",
    name: "Golden Hour",
    vibe: "Sun-drenched, slow light leaks, warm acoustic",
    emoji: "🌅",
    accent: "#FF8A4A",
    grade: { saturate: 1.25, contrast: 1.05, brightness: 1.06, sepia: 0.28, hue: -10 },
    fx: { leak: { colors: ["#ffb347", "#ff6b4a"], strength: 0.6 }, glow: { color: "#ffcf7a", strength: 0.4 }, vignette: 0.35, grain: 0.12 },
    particles: { kind: "flares", colors: ["#ffd27a", "#ff9a5a"], density: 0.6 },
    music: { ref: "audio.warm-acoustic-092@1.0.0", name: "Warm Acoustic", bpm: 92 },
    transitions: ["light-leak", "dissolve", "soft-bloom"],
    transitionSec: 0.8,
    easing: "ease-in-out",
    motions: [kb("ken-burns"), kb("float"), kb("ken-burns-out")],
    beatsPerShot: 4,
    text: { style: "soft-serif", color: "#FFE2B8", anim: "dissolve", captionStyle: "soft-serif" },
    intro: "golden hour",
    outro: "chasing the light ☀",
    bg: ["#1C1008", "#5a2a10", "#FF8A4A"],
  },
  {
    id: "theme.ocean-pop",
    name: "Ocean Pop",
    vibe: "Fresh teal pop, push cuts, sea breeze",
    emoji: "🌊",
    accent: "#3DDC97",
    grade: { saturate: 1.35, contrast: 1.08, brightness: 1.04, hue: 10 },
    fx: { glow: { color: "#5ff2d0", strength: 0.25 }, vignette: 0.25, leak: { colors: ["#3ddcff", "#3DDC97"], strength: 0.25 } },
    particles: { kind: "bokeh", colors: ["#b8fff0", "#7fd8ff", "#ffffff"], density: 0.7 },
    music: { ref: "audio.ocean-drift-084@1.0.0", name: "Ocean Drift", bpm: 84 },
    transitions: ["push", "slide-up", "circle-wipe"],
    transitionSec: 0.5,
    easing: "back-out",
    motions: [kb("ken-burns", { in: "slide-up", inSec: 0.4 }), kb("sway"), kb("ken-burns-out")],
    beatsPerShot: 4,
    text: { style: "bold-impact", color: "#E8FFF6", anim: "pop", captionStyle: "caption-pill", captionAnim: "word-pop" },
    intro: "salt & sun",
    outro: "until the next wave 🌊",
    bg: ["#06141C", "#0b3a4a", "#3DDC97"],
  },
  {
    id: "theme.soft-film",
    name: "Soft Film",
    vibe: "Faded 35mm, grain, gentle dissolves",
    emoji: "🎞️",
    accent: "#F5C542",
    grade: { saturate: 0.85, contrast: 0.9, brightness: 1.05, sepia: 0.3 },
    fx: { grain: 0.55, vignette: 0.45, leak: { colors: ["#ffcc80", "#ff8a65"], strength: 0.35 } },
    particles: { kind: "none", colors: [], density: 0 },
    music: { ref: "lib:lib.audio.cozy-keys", name: "Cozy Keys", bpm: 80 },
    transitions: ["dissolve", "blur-fade", "fade-black"],
    transitionSec: 0.9,
    easing: "ease-in-out",
    motions: [kb("ken-burns"), kb("ken-burns-out"), kb("float")],
    beatsPerShot: 4,
    text: { style: "vintage-poster", color: "#F4E6C8", anim: "typewriter", captionStyle: "soft-serif" },
    intro: "a little film",
    outro: "kept forever",
    bg: ["#1A1410", "#3a2c20", "#F5C542"],
  },
  {
    id: "theme.retro-vhs",
    name: "Retro VHS",
    vibe: "Tracking lines, RGB glitch, 80s funk",
    emoji: "📼",
    accent: "#FF2D95",
    grade: { saturate: 1.4, contrast: 1.15, brightness: 1.0, hue: 8, sepia: 0.1 },
    fx: { scanlines: 0.7, glitch: 0.65, grain: 0.35, vignette: 0.4, glow: { color: "#ff2d95", strength: 0.2 } },
    particles: { kind: "none", colors: [], density: 0 },
    music: { ref: "audio.funk-loop-104@1.0.0", name: "Funk Loop", bpm: 104 },
    transitions: ["glitch", "flash", "whip", "slide-right"],
    transitionSec: 0.25,
    easing: "linear",
    motions: [kb("shake", { in: "pop", inSec: 0.2 }), kb("ken-burns"), kb("pulse")],
    beatsPerShot: 2,
    text: { style: "mono-tech", color: "#7DFFE0", anim: "typewriter", captionStyle: "mono-tech", captionAnim: "typewriter" },
    intro: "▶ PLAY  SP 0:00:00",
    outro: "■ STOP · be kind, rewind",
    bg: ["#12081A", "#2b0e3a", "#FF2D95"],
  },
  {
    id: "theme.y2k-chrome",
    name: "Y2K Chrome",
    vibe: "Liquid chrome, star sparkles, hyperpop",
    emoji: "💿",
    accent: "#9BE7FF",
    grade: { saturate: 1.2, contrast: 1.2, brightness: 1.06, hue: 18 },
    fx: { duotone: { dark: "#2a1b6b", light: "#d9f4ff", strength: 0.4 }, glow: { color: "#c8f0ff", strength: 0.45 }, vignette: 0.2, glitch: 0.15 },
    particles: { kind: "stars", colors: ["#ffffff", "#c9f6ff", "#ffb8f6"], density: 0.8 },
    music: { ref: "audio.hyperfun-128@1.0.0", name: "Hyperfun", bpm: 128 },
    transitions: ["zoom-through", "spin", "flash", "circle-wipe"],
    transitionSec: 0.35,
    easing: "back-out",
    motions: [kb("pulse", { in: "pop", inSec: 0.3 }), kb("ken-burns", { in: "spin", inSec: 0.4 }), kb("float")],
    beatsPerShot: 2,
    text: { style: "kinetic-outline", color: "#DDF6FF", anim: "scale-bounce", captionStyle: "caption-pill", captionAnim: "word-bounce" },
    intro: "✧ 2000 & forever ✧",
    outro: "✧ stay shiny ✧",
    bg: ["#0b0b22", "#3b3f7a", "#9BE7FF"],
  },
  {
    id: "theme.dreamy-pastel",
    name: "Dreamy Pastel",
    vibe: "Cotton-candy haze, floating hearts, soft blooms",
    emoji: "🩷",
    accent: "#FFB3DE",
    grade: { saturate: 0.9, contrast: 0.85, brightness: 1.12, hue: -6 },
    fx: { duotone: { dark: "#7a5cff", light: "#ffe3f3", strength: 0.25 }, glow: { color: "#ffd6f0", strength: 0.5 }, vignette: 0.15 },
    particles: { kind: "hearts", colors: ["#ffb3de", "#ffd6f0", "#c9b8ff"], density: 0.55 },
    music: { ref: "audio.lobby-time-096@1.0.0", name: "Lobby Time", bpm: 96 },
    transitions: ["soft-bloom", "heart-wipe", "dissolve"],
    transitionSec: 0.8,
    easing: "ease-in-out",
    motions: [kb("float", { in: "fade", inSec: 0.6 }), kb("ken-burns"), kb("sway")],
    beatsPerShot: 4,
    text: { style: "script-soft", color: "#FFF0FA", anim: "dissolve", captionStyle: "script-soft" },
    intro: "soft days ♡",
    outro: "with love ♡",
    bg: ["#2a1830", "#7a5c9a", "#FFB3DE"],
  },
  {
    id: "theme.mono-cinema",
    name: "Monochrome Cinema",
    vibe: "Black & white, letterbox, slow noir",
    emoji: "🎬",
    accent: "#E8E8E8",
    grade: { grayscale: 1, contrast: 1.3, brightness: 0.98 },
    fx: { letterbox: 0.85, grain: 0.45, vignette: 0.6, leak: { colors: ["#ffffff"], strength: 0.12 } },
    particles: { kind: "none", colors: [], density: 0 },
    music: { ref: "audio.spy-glass-100@1.0.0", name: "Spy Glass", bpm: 100 },
    transitions: ["fade-black", "dissolve", "blur-fade"],
    transitionSec: 1.0,
    easing: "ease-in-out",
    motions: [kb("ken-burns"), kb("ken-burns-out"), kb("none")],
    beatsPerShot: 4,
    text: { style: "soft-serif", color: "#F2F2F2", anim: "fade", captionStyle: "soft-serif" },
    intro: "A FILM BY YOU",
    outro: "FIN.",
    bg: ["#050505", "#222222", "#E8E8E8"],
  },
  {
    id: "theme.party-strobe",
    name: "Party Strobe",
    vibe: "Strobe flashes, confetti, dance-floor punch",
    emoji: "🎉",
    accent: "#FF3D81",
    grade: { saturate: 1.55, contrast: 1.15, hue: -6 },
    fx: { glow: { color: "#ff3d81", strength: 0.35 }, vignette: 0.4, glitch: 0.2, strobe: 0.45 },
    particles: { kind: "confetti", colors: ["#ff3d81", "#ffd23d", "#3df2ff", "#9b5cff", "#ffffff"], density: 0.9 },
    music: { ref: "audio.carefree-140@1.0.0", name: "Carefree", bpm: 140 },
    transitions: ["flash", "zoom-through", "whip", "spin"],
    transitionSec: 0.2,
    easing: "ease-out",
    motions: [kb("pulse", { in: "pop", inSec: 0.2 }), kb("shake"), kb("ken-burns", { in: "zoom-out", inSec: 0.25 })],
    beatsPerShot: 2,
    text: { style: "bold-impact", color: "#FFE14D", anim: "scale-bounce", captionStyle: "bold-impact", captionAnim: "word-pop" },
    intro: "LET'S GO 🎉",
    outro: "best night ever 🪩",
    bg: ["#0C0418", "#3a0c48", "#FF3D81"],
  },
  {
    id: "theme.cyber-lime",
    name: "Cyber Lime",
    vibe: "Acid lime on black, zoom punches, rave",
    emoji: "🟢",
    accent: "#B8FF3D",
    grade: { saturate: 1.3, contrast: 1.25, brightness: 0.95, hue: 30 },
    fx: { duotone: { dark: "#06120a", light: "#e9ffc4", strength: 0.35 }, scanlines: 0.3, glitch: 0.4, vignette: 0.5 },
    particles: { kind: "sparks", colors: ["#B8FF3D", "#eaffb0"], density: 0.6 },
    music: { ref: "lib:lib.audio.party-pulse", name: "Party Pulse", bpm: 126 },
    transitions: ["zoom-through", "glitch", "slide-left"],
    transitionSec: 0.25,
    easing: "ease-out",
    motions: [kb("ken-burns-out", { in: "zoom-in", inSec: 0.25 }), kb("shake"), kb("pulse")],
    beatsPerShot: 2,
    text: { style: "mono-tech", color: "#B8FF3D", anim: "flash-in", captionStyle: "mono-tech", captionAnim: "karaoke" },
    intro: "// SYSTEM ONLINE",
    outro: "// END OF LINE",
    bg: ["#050A04", "#14300c", "#B8FF3D"],
  },
  {
    id: "theme.rose-quartz",
    name: "Rose Quartz",
    vibe: "Blush haze, waltz, romantic slide-ups",
    emoji: "🌹",
    accent: "#F2A7C3",
    grade: { saturate: 1.05, contrast: 0.95, brightness: 1.06, sepia: 0.12, hue: -12 },
    fx: { glow: { color: "#ffc4d8", strength: 0.4 }, vignette: 0.3, leak: { colors: ["#ff9ec0"], strength: 0.3 }, grain: 0.1 },
    particles: { kind: "bokeh", colors: ["#ffd1e1", "#ffffff"], density: 0.5 },
    music: { ref: "lib:lib.audio.love-waltz", name: "Love Waltz", bpm: 90 },
    transitions: ["slide-up", "soft-bloom", "dissolve"],
    transitionSec: 0.7,
    easing: "ease-in-out",
    motions: [kb("float"), kb("ken-burns"), kb("sway")],
    beatsPerShot: 3,
    text: { style: "script-soft", color: "#FFE0EC", anim: "slide-up", captionStyle: "soft-serif", captionAnim: "word-pop" },
    intro: "forever & always",
    outro: "♡",
    bg: ["#1A1014", "#4a2030", "#F2A7C3"],
  },
  {
    id: "theme.documentary-grain",
    name: "Documentary Grain",
    vibe: "Earthy, observational, strings & grain",
    emoji: "📽️",
    accent: "#C4A574",
    grade: { saturate: 0.8, contrast: 1.05, sepia: 0.18 },
    fx: { grain: 0.6, vignette: 0.5, letterbox: 0.4 },
    particles: { kind: "none", colors: [], density: 0 },
    music: { ref: "lib:lib.audio.wedding-strings", name: "Strings", bpm: 72 },
    transitions: ["fade-black", "dissolve"],
    transitionSec: 0.9,
    easing: "ease-in-out",
    motions: [kb("ken-burns"), kb("none"), kb("ken-burns-out")],
    beatsPerShot: 3,
    text: { style: "clean-sans", color: "#EDE6DC", anim: "fade", captionStyle: "clean-sans" },
    intro: "field notes",
    outro: "— the end —",
    bg: ["#141210", "#2e2820", "#C4A574"],
  },
  {
    id: "theme.minimal-white",
    name: "Minimal White",
    vibe: "Gallery-clean, crisp fades, calm",
    emoji: "🤍",
    accent: "#2A2A2A",
    grade: { saturate: 1.05, contrast: 1.04, brightness: 1.08 },
    fx: { vignette: 0.05 },
    particles: { kind: "none", colors: [], density: 0 },
    music: { ref: "lib:lib.audio.travel-breeze", name: "Travel Breeze", bpm: 98 },
    transitions: ["fade-black", "slide-left", "dissolve"],
    transitionSec: 0.5,
    easing: "ease-in-out",
    motions: [kb("none", { in: "fade", inSec: 0.4 }), kb("ken-burns"), kb("none")],
    beatsPerShot: 4,
    text: { style: "clean-sans", color: "#FFFFFF", anim: "fade", captionStyle: "caption-pill" },
    intro: "",
    outro: "",
    bg: ["#F4F2EE", "#dcd8d0", "#2A2A2A"],
  },
];

export const DEFAULT_LOOK_ID = "theme.ocean-pop";
export const DEFAULT_INTENSITY = 0.7;

export function getLook(id: string | undefined): ThemeLook {
  return THEME_LOOKS.find((l) => l.id === id) ?? THEME_LOOKS.find((l) => l.id === DEFAULT_LOOK_ID)!;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Intensity: 0 = subtle (but still clearly the theme), 1 = bold. Effective strength 0.35→1.3. */
export function lookStrength(intensity: number | undefined): number {
  const k = clamp01(intensity ?? DEFAULT_INTENSITY);
  return 0.35 + k * 0.95;
}

function gradeAt(g: LookGrade, s: number): Required<LookGrade> {
  const lerp1 = (v: number | undefined) => 1 + ((v ?? 1) - 1) * s;
  return {
    saturate: Math.max(0, lerp1(g.saturate)),
    contrast: Math.max(0.2, lerp1(g.contrast)),
    brightness: Math.max(0.2, lerp1(g.brightness)),
    sepia: clamp01((g.sepia ?? 0) * s),
    hue: (g.hue ?? 0) * s,
    grayscale: clamp01((g.grayscale ?? 0) * Math.min(1, s * 1.4)),
  };
}

/** CSS / canvas 2D filter string for the look's grade. */
export function lookGradeCss(look: ThemeLook, intensity?: number): string {
  const g = gradeAt(look.grade, lookStrength(intensity));
  const p: string[] = [];
  if (g.grayscale > 0) p.push(`grayscale(${r3(g.grayscale)})`);
  if (g.sepia > 0) p.push(`sepia(${r3(g.sepia)})`);
  if (g.saturate !== 1) p.push(`saturate(${r3(g.saturate)})`);
  if (g.contrast !== 1) p.push(`contrast(${r3(g.contrast)})`);
  if (g.brightness !== 1) p.push(`brightness(${r3(g.brightness)})`);
  if (g.hue) p.push(`hue-rotate(${Math.round(g.hue)}deg)`);
  return p.length ? p.join(" ") : "none";
}

/** ffmpeg filter chain approximating lookGradeCss (same order). */
export function lookGradeFfmpeg(look: ThemeLook, intensity?: number): string | null {
  const g = gradeAt(look.grade, lookStrength(intensity));
  const p: string[] = [];
  if (g.grayscale > 0) p.push(`hue=s=${r3(1 - g.grayscale)}`);
  if (g.sepia > 0) {
    const a = g.sepia;
    const m = (id: number, sp: number) => r3(id * (1 - a) + sp * a);
    p.push(
      `colorchannelmixer=rr=${m(1, 0.393)}:rg=${m(0, 0.769)}:rb=${m(0, 0.189)}:gr=${m(0, 0.349)}:gg=${m(1, 0.686)}:gb=${m(0, 0.168)}:br=${m(0, 0.272)}:bg=${m(0, 0.534)}:bb=${m(1, 0.131)}`,
    );
  }
  if (g.saturate !== 1 || g.contrast !== 1 || g.brightness !== 1)
    p.push(`eq=saturation=${r3(g.saturate)}:contrast=${r3(g.contrast)}:brightness=${r3((g.brightness - 1) * 0.5)}`);
  if (g.hue) p.push(`hue=h=${Math.round(g.hue)}`);
  return p.length ? p.join(",") : null;
}

// ───────── FX ops ─────────

export type FxBlend = "screen" | "multiply" | "normal" | "overlay";
export type FxOp =
  | { t: "rect"; blend: FxBlend; x: number; y: number; w: number; h: number; color: string; a: number }
  /** radial: alpha a at center fading to 0 at r (or, with `edge`, 0 inside `inner*r` rising to a at r and beyond) */
  | { t: "radial"; blend: FxBlend; cx: number; cy: number; r: number; color: string; a: number; inner?: number; edge?: boolean }
  | { t: "lines"; blend: FxBlend; spacing: number; thick: number; color: string; a: number; offset: number }
  | { t: "shape"; blend: FxBlend; shape: "circle" | "soft" | "heart" | "star" | "rect"; cx: number; cy: number; r: number; rot: number; color: string; a: number }
  | { t: "grain"; blend: "overlay"; amount: number; seed: number };

/** deterministic hash → [0,1) */
export function hash01(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * Draw ops for one frame. Coordinates are in output pixels (w×h); `t` is
 * story time in seconds. Purely a function of its arguments.
 */
export function fxOps(look: ThemeLook, intensity: number | undefined, t: number, w: number, h: number): FxOp[] {
  const s = lookStrength(intensity);
  const fx = look.fx;
  const ops: FxOp[] = [];
  const m = Math.min(w, h);
  const D = Math.hypot(w, h) / 2;
  if (fx.duotone) {
    const k = clamp01(fx.duotone.strength * s);
    ops.push({ t: "rect", blend: "screen", x: 0, y: 0, w, h, color: fx.duotone.dark, a: k });
    ops.push({ t: "rect", blend: "multiply", x: 0, y: 0, w, h, color: fx.duotone.light, a: k });
  }
  if (fx.leak) {
    fx.leak.colors.forEach((c, i) => {
      const ph = i * 2.1 + 0.7;
      const cx = w * (0.5 + 0.55 * Math.sin(t * 0.33 + ph));
      const cy = h * (0.35 + 0.4 * Math.cos(t * 0.21 + ph * 1.3));
      const pulse = 0.65 + 0.35 * Math.sin(t * 0.9 + ph);
      ops.push({ t: "radial", blend: "screen", cx, cy, r: D * 0.85, color: c, a: clamp01(fx.leak!.strength * s * pulse) });
    });
  }
  if (fx.glow) {
    ops.push({ t: "radial", blend: "screen", cx: w / 2, cy: h * 0.45, r: D * 1.1, color: fx.glow.color, a: clamp01(fx.glow.strength * s * 0.45) });
  }
  // particles
  const P = look.particles;
  if (P.kind !== "none" && P.density > 0) {
    const n = Math.round((P.kind === "bokeh" || P.kind === "flares" ? 9 : 26) * P.density * Math.min(1.3, s));
    for (let i = 0; i < n; i++) {
      const a1 = hash01(i * 7 + 1), a2 = hash01(i * 7 + 2), a3 = hash01(i * 7 + 3), a4 = hash01(i * 7 + 4), a5 = hash01(i * 7 + 5);
      const color = P.colors[i % P.colors.length] ?? "#ffffff";
      const speed = 0.04 + a3 * 0.08;
      switch (P.kind) {
        case "snow": {
          const y = ((a2 + t * speed) % 1) * (h + 40) - 20;
          const x = (a1 * w + Math.sin(t * 0.8 + a4 * 6) * m * 0.03 + w) % w;
          ops.push({ t: "shape", blend: "normal", shape: "soft", cx: x, cy: y, r: m * (0.006 + a5 * 0.01), rot: 0, color, a: 0.85 });
          break;
        }
        case "confetti": {
          const y = ((a2 + t * (speed * 1.8)) % 1) * (h + 40) - 20;
          const x = (a1 * w + Math.sin(t * 1.4 + a4 * 6) * m * 0.05 + w) % w;
          ops.push({ t: "shape", blend: "normal", shape: "rect", cx: x, cy: y, r: m * (0.01 + a5 * 0.008), rot: t * (2 + a4 * 4) + a1 * 6, color, a: 0.95 });
          break;
        }
        case "hearts": {
          const y = h + 20 - ((a2 + t * speed) % 1) * (h + 40);
          const x = (a1 * w + Math.sin(t * 0.9 + a4 * 6) * m * 0.04 + w) % w;
          ops.push({ t: "shape", blend: "normal", shape: "heart", cx: x, cy: y, r: m * (0.014 + a5 * 0.016), rot: Math.sin(t + a4 * 6) * 0.3, color, a: 0.8 });
          break;
        }
        case "sparks": {
          const y = h + 10 - ((a2 + t * speed * 1.4) % 1) * (h + 20);
          const x = (a1 * w + Math.sin(t * 2 + a4 * 9) * m * 0.02 + w) % w;
          const tw = 0.5 + 0.5 * Math.sin(t * (6 + a5 * 6) + a4 * 9);
          ops.push({ t: "shape", blend: "screen", shape: "soft", cx: x, cy: y, r: m * (0.008 + a5 * 0.01), rot: 0, color, a: 0.4 + 0.6 * tw });
          break;
        }
        case "stars": {
          const x = a1 * w, y = a2 * h;
          const tw = Math.max(0, Math.sin(t * (2.5 + a5 * 3) + a4 * 9));
          if (tw > 0.05) ops.push({ t: "shape", blend: "screen", shape: "star", cx: x, cy: y, r: m * (0.02 + a3 * 0.03) * tw, rot: 0, color, a: tw });
          break;
        }
        case "bokeh": {
          const x = (a1 * w + t * m * 0.015 * (a4 - 0.5) * 2 + w * 2) % w;
          const y = (a2 * h + Math.sin(t * 0.4 + a4 * 6) * m * 0.04 + h) % h;
          ops.push({ t: "shape", blend: "screen", shape: "soft", cx: x, cy: y, r: m * (0.05 + a5 * 0.07), rot: 0, color, a: 0.18 + 0.2 * Math.sin(t * 0.7 + a3 * 6) ** 2 });
          break;
        }
        case "flares": {
          if (i === 0) {
            const cx = w * (0.82 + 0.06 * Math.sin(t * 0.25)), cy = h * (0.12 + 0.03 * Math.cos(t * 0.3));
            ops.push({ t: "radial", blend: "screen", cx, cy, r: m * 0.45, color, a: 0.7 });
            for (let k = 1; k <= 4; k++) {
              const f = k / 5;
              ops.push({ t: "shape", blend: "screen", shape: "soft", cx: cx + (w / 2 - cx) * f * 2, cy: cy + (h / 2 - cy) * f * 2, r: m * (0.03 + 0.02 * k), rot: 0, color: P.colors[k % P.colors.length], a: 0.25 });
            }
          } else {
            const x = a1 * w, y = a2 * h * 0.7;
            ops.push({ t: "shape", blend: "screen", shape: "soft", cx: x, cy: y, r: m * (0.02 + a5 * 0.03), rot: 0, color, a: 0.12 + 0.12 * Math.sin(t + a4 * 6) ** 2 });
          }
          break;
        }
      }
    }
  }
  if (fx.strobe) {
    const beats = (t * look.music.bpm) / 60;
    const ph = (beats / 2) % 1;
    const a = clamp01(fx.strobe * s * Math.max(0, 1 - ph * 7));
    if (a > 0.01) ops.push({ t: "rect", blend: "screen", x: 0, y: 0, w, h, color: "#ffffff", a });
  }
  if (fx.glitch) {
    const bucket = Math.floor(t * 9);
    const g = fx.glitch * s;
    if (hash01(bucket * 31 + 7) < 0.1 + 0.25 * g) {
      const bars = 2 + Math.floor(hash01(bucket * 31 + 8) * 3);
      for (let i = 0; i < bars; i++) {
        const y = hash01(bucket * 31 + 9 + i) * h;
        const bh = h * (0.01 + hash01(bucket * 31 + 20 + i) * 0.05);
        const dx = (hash01(bucket * 31 + 40 + i) - 0.5) * w * 0.06;
        ops.push({ t: "rect", blend: "screen", x: dx, y, w, h: bh, color: i % 2 ? "#00ffff" : "#ff00aa", a: clamp01(0.35 * g + 0.15) });
      }
    }
  }
  if (fx.scanlines) {
    const k = clamp01(fx.scanlines * s);
    const sp = Math.max(2, Math.round(h / 240));
    ops.push({ t: "lines", blend: "normal", spacing: sp * 2, thick: sp, color: "#000000", a: 0.28 * k, offset: 0 });
    const band = ((t * 0.18) % 1.2) * h - 0.1 * h;
    ops.push({ t: "rect", blend: "screen", x: 0, y: band, w, h: h * 0.05, color: "#ffffff", a: 0.12 * k });
  }
  if (fx.vignette) {
    ops.push({ t: "radial", blend: "normal", cx: w / 2, cy: h / 2, r: D, color: "#000000", a: clamp01(fx.vignette * s * 0.85), inner: 0.45, edge: true });
  }
  if (fx.grain) {
    ops.push({ t: "grain", blend: "overlay", amount: clamp01(fx.grain * s * 0.6), seed: Math.floor(t * 24) });
  }
  if (fx.letterbox) {
    const bh = Math.round(h * 0.07 * clamp01(fx.letterbox * s));
    if (bh > 0) {
      ops.push({ t: "rect", blend: "normal", x: 0, y: 0, w, h: bh, color: "#000000", a: 1 });
      ops.push({ t: "rect", blend: "normal", x: 0, y: h - bh, w, h: bh, color: "#000000", a: 1 });
    }
  }
  return ops;
}

// ───────── software rasteriser (CLI) ─────────

function hexRgb(c: string): [number, number, number] {
  const s = c.replace("#", "");
  const f = s.length === 3 ? s.split("").map((x) => x + x).join("") : s.padEnd(6, "0");
  return [parseInt(f.slice(0, 2), 16) / 255, parseInt(f.slice(2, 4), 16) / 255, parseInt(f.slice(4, 6), 16) / 255];
}

function heartIn(x: number, y: number): boolean {
  // classic implicit heart, y up
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

/**
 * Rasterise ops into three stacked RGBA bands (w × 3h):
 *   band 0: screen layer (black = no-op)
 *   band 1: multiply layer (white = no-op)
 *   band 2: normal layer (straight alpha)
 * "overlay" (grain) ops are skipped — the CLI uses ffmpeg's noise filter.
 */
export function rasterizeFx(ops: FxOp[], w: number, h: number): Uint8ClampedArray {
  const scr = new Float32Array(w * h * 3);
  const mul = new Float32Array(w * h * 3).fill(1);
  const nrm = new Float32Array(w * h * 4); // premultiplied
  const put = (blend: FxBlend, i: number, rgb: [number, number, number], a: number) => {
    if (a <= 0) return;
    if (blend === "screen") {
      for (let c = 0; c < 3; c++) scr[i * 3 + c] = 1 - (1 - scr[i * 3 + c]) * (1 - rgb[c] * a);
    } else if (blend === "multiply") {
      for (let c = 0; c < 3; c++) mul[i * 3 + c] *= 1 - a + a * rgb[c];
    } else if (blend === "normal") {
      const o = i * 4;
      for (let c = 0; c < 3; c++) nrm[o + c] = rgb[c] * a + nrm[o + c] * (1 - a);
      nrm[o + 3] = a + nrm[o + 3] * (1 - a);
    }
  };
  for (const op of ops) {
    if (op.t === "grain") continue;
    const rgb = hexRgb(op.color);
    if (op.t === "rect") {
      const x0 = Math.max(0, Math.floor(op.x)), x1 = Math.min(w, Math.ceil(op.x + op.w));
      const y0 = Math.max(0, Math.floor(op.y)), y1 = Math.min(h, Math.ceil(op.y + op.h));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(op.blend, y * w + x, rgb, op.a);
    } else if (op.t === "lines") {
      for (let y = 0; y < h; y++) {
        if ((y + op.offset) % op.spacing >= op.thick) continue;
        for (let x = 0; x < w; x++) put(op.blend, y * w + x, rgb, op.a);
      }
    } else if (op.t === "radial") {
      const inner = op.inner ?? 0;
      const full = op.edge;
      const x0 = full ? 0 : Math.max(0, Math.floor(op.cx - op.r)), x1 = full ? w : Math.min(w, Math.ceil(op.cx + op.r));
      const y0 = full ? 0 : Math.max(0, Math.floor(op.cy - op.r)), y1 = full ? h : Math.min(h, Math.ceil(op.cy + op.r));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const d = Math.hypot(x + 0.5 - op.cx, y + 0.5 - op.cy) / op.r;
          let a: number;
          if (op.edge) a = d <= inner ? 0 : op.a * Math.min(1, (d - inner) / (1 - inner));
          else a = d >= 1 ? 0 : op.a * (1 - d) * (1 - d);
          put(op.blend, y * w + x, rgb, a);
        }
    } else if (op.t === "shape") {
      const R = op.r * (op.shape === "rect" ? 1.2 : 1.6) + 1;
      const x0 = Math.max(0, Math.floor(op.cx - R)), x1 = Math.min(w, Math.ceil(op.cx + R));
      const y0 = Math.max(0, Math.floor(op.cy - R)), y1 = Math.min(h, Math.ceil(op.cy + R));
      const cs = Math.cos(op.rot), sn = Math.sin(op.rot);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const dx = x + 0.5 - op.cx, dy = y + 0.5 - op.cy;
          const u = (dx * cs + dy * sn) / op.r, v = (-dx * sn + dy * cs) / op.r;
          let a = 0;
          if (op.shape === "circle") a = u * u + v * v <= 1 ? 1 : 0;
          else if (op.shape === "soft") { const d = Math.hypot(u, v); a = d >= 1 ? 0 : (1 - d) * (1 - d) * 1.4; }
          else if (op.shape === "rect") a = Math.abs(u) <= 1 && Math.abs(v) <= 0.45 ? 1 : 0;
          else if (op.shape === "heart") a = heartIn(u * 1.1, -v * 1.1 + 0.25) ? 1 : 0;
          else if (op.shape === "star") { const ax = Math.abs(u), ay = Math.abs(v); a = Math.max(0, 1 - ax * 8 - ay) + Math.max(0, 1 - ay * 8 - ax); a = Math.min(1, a); }
          put(op.blend, y * w + x, rgb, op.a * Math.min(1, a));
        }
    }
  }
  const out = new Uint8ClampedArray(w * h * 3 * 4);
  for (let i = 0; i < w * h; i++) {
    const o0 = i * 4, o1 = (w * h + i) * 4, o2 = (2 * w * h + i) * 4;
    for (let c = 0; c < 3; c++) {
      out[o0 + c] = scr[i * 3 + c] * 255;
      out[o1 + c] = mul[i * 3 + c] * 255;
      const a = nrm[i * 4 + 3];
      out[o2 + c] = a > 0 ? (nrm[i * 4 + c] / a) * 255 : 0;
    }
    out[o0 + 3] = 255;
    out[o1 + 3] = 255;
    out[o2 + 3] = nrm[i * 4 + 3] * 255;
  }
  return out;
}

// ───────── applying a look to a story ─────────

export interface RetimeClip {
  id: string;
  kind?: string;
  durationSec: number;
  sourceSec?: number;
  inSec?: number;
}

export interface RetimedClip {
  id: string;
  durationSec: number;
  transitionOut: TransitionKind | undefined;
  transitionSpec: { durationSec: number; easing: Easing } | undefined;
  animation: ClipAnimation;
}

/**
 * Re-time an existing story to a look's track: keep order, put every cut on
 * a beat of the theme's music, cycle the theme's transitions and motions.
 * Story length stays in the 15–30s band when possible.
 */
export function lookRetime(clips: RetimeClip[], look: ThemeLook, opts: { targetSec?: number } = {}): { clips: RetimedClip[]; totalSec: number } {
  const n = clips.length;
  if (!n) return { clips: [], totalSec: 0 };
  const beat = 60 / (look.music.bpm || 100);
  const tx = look.transitionSec;
  const target = opts.targetSec ?? Math.min(30, Math.max(15, n * 2.6));
  let beats = Math.max(1, Math.round(target / n / beat));
  // prefer the look's phrase length when it doesn't blow the band
  const pref = look.beatsPerShot;
  if (Math.abs(pref * beat * n - target) < Math.abs(beats * beat * n - target) + n * beat * 0.5) beats = pref;
  while (beats > 1 && beats * beat * n > 32) beats--;
  while (beats * beat * n < 12 && beats < 16) beats++;
  const step = beats * beat;
  let total = 0;
  const out = clips.map((c, i) => {
    const last = i === n - 1;
    let hold = step + (last ? beat * 2 : tx);
    if (c.kind === "video" && c.sourceSec) hold = Math.min(hold, Math.max(0.5, c.sourceSec - (c.inSec ?? 0)));
    hold = Math.round(hold * 1000) / 1000;
    total += hold - (last ? 0 : tx);
    return {
      id: c.id,
      durationSec: hold,
      transitionOut: last ? undefined : look.transitions[i % look.transitions.length],
      transitionSpec: last ? undefined : { durationSec: tx, easing: look.easing },
      // first shot is the poster frame: no entrance animation (it would start invisible)
      animation: i === 0 ? { ...look.motions[0], in: undefined, inSec: undefined } : look.motions[i % look.motions.length],
    };
  });
  return { clips: out, totalSec: Math.round(total * 100) / 100 };
}

/** Text overlays a look adds (intro title card + outro card). */
export function lookCards(look: ThemeLook, title: string, totalSec: number): Array<{ id: string; role: "title" | "subtitle" | "caption"; value: string; at: number; end: number; position: "center" | "lower-third" | "top" | "bottom" }> {
  const out: Array<{ id: string; role: "title" | "subtitle" | "caption"; value: string; at: number; end: number; position: "center" | "lower-third" | "top" | "bottom" }> = [];
  if (totalSec <= 0) return out;
  const introEnd = Math.min(3, totalSec * 0.4);
  if (title.trim()) out.push({ id: "theme-title", role: "title", value: title.trim(), at: 0.15, end: introEnd, position: "center" });
  if (look.intro) out.push({ id: "theme-intro", role: "subtitle", value: look.intro, at: 0.45, end: introEnd, position: "top" });
  if (look.outro && totalSec > 6) out.push({ id: "theme-outro", role: "subtitle", value: look.outro, at: Math.max(introEnd + 0.5, totalSec - 2.2), end: totalSec, position: "center" });
  return out;
}

/** Background for guest pages / stage letterboxing. */
export function lookBackground(look: ThemeLook): string {
  const [a, b, c] = look.bg;
  return `radial-gradient(120% 80% at 50% 0%, ${b} 0%, ${a} 60%), radial-gradient(60% 40% at 80% 100%, ${c}33 0%, transparent 70%)`;
}
