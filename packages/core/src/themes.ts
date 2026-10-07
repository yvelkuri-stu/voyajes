/** Theme / catalog pack types (official catalog + project refs) */

export type PackKind =
  | "theme"
  | "template"
  | "motion"
  | "audio-beat"
  | "font"
  | "lut";

export type PackTier = "free" | "spark" | "pro" | "studio";

export type MotionEasing = "soft" | "snappy" | "float" | "cinematic";

export type TransitionKind =
  | "cut"
  | "dissolve"
  | "push"
  | "whip"
  | "light-leak"
  | "fade-black"
  | "zoom-through"
  | "slide-up"
  | "flash"
  | "slide-left"
  | "slide-right"
  | "circle-wipe"
  | "blur-fade"
  | "spin"
  | "glitch"
  | "heart-wipe"
  | "soft-bloom";

/** All transitions the preview / export / CLI understand */
export const TRANSITION_KINDS: TransitionKind[] = [
  "cut",
  "dissolve",
  "push",
  "whip",
  "light-leak",
  "fade-black",
  "zoom-through",
  "slide-up",
  "flash",
  "slide-left",
  "slide-right",
  "circle-wipe",
  "blur-fade",
  "spin",
  "glitch",
  "heart-wipe",
  "soft-bloom",
];

/** Title / caption look presets (original Voyajes — not CapCut assets) */
export type TextStyleKind =
  | "bold-impact"
  | "soft-serif"
  | "clean-sans"
  | "script-soft"
  | "mono-tech"
  | "vintage-poster"
  | "caption-pill"
  | "kinetic-outline";

export const TEXT_STYLE_KINDS: TextStyleKind[] = [
  "bold-impact",
  "soft-serif",
  "clean-sans",
  "script-soft",
  "mono-tech",
  "vintage-poster",
  "caption-pill",
  "kinetic-outline",
];

/** How on-screen text enters */
export type TextTransitionKind =
  | "fade"
  | "pop"
  | "slide-up"
  | "typewriter"
  | "whip-in"
  | "scale-bounce"
  | "dissolve"
  | "flash-in";

export const TEXT_TRANSITION_KINDS: TextTransitionKind[] = [
  "fade",
  "pop",
  "slide-up",
  "typewriter",
  "whip-in",
  "scale-bounce",
  "dissolve",
  "flash-in",
];

export type DurationTargetSec = 15 | 30 | 60;

export interface ThemePalette {
  bg: string;
  surface: string;
  accent: string;
  text: string;
  grade?: string;
}

export interface ThemePack {
  id: string;
  kind: "theme";
  version: string;
  name: string;
  description?: string;
  tier: PackTier;
  tags: string[];
  palette: ThemePalette;
  motion: MotionEasing;
  transition: TransitionKind;
  transitionDurationMs: number;
  photoMotion: "gentle" | "bold" | "off";
  /** Preferred catalog beat pack ids for this look */
  suggestedBeatIds?: string[];
}

/**
 * A full CapCut/Canva-style template pack: theme + motion + clip transition +
 * beat + text style defaults. Original Voyajes combos — no proprietary assets.
 */
export interface TemplatePack {
  id: string;
  kind: "template";
  version: string;
  name: string;
  description?: string;
  tier: PackTier;
  tags: string[];
  /** Theme pack id (without @version) */
  themeId: string;
  motion: MotionEasing;
  transition: TransitionKind;
  transitionDurationMs: number;
  photoMotion: "gentle" | "bold" | "off";
  /** Audio beat pack id */
  beatId: string;
  beatSync: "off" | "soft" | "medium" | "hard";
  textStyle: TextStyleKind;
  textTransition: TextTransitionKind;
  /** Suggested social aspect */
  aspect?: "9:16" | "16:9" | "1:1" | "4:5";
  /** Soft target length for social cuts */
  durationTargetSec?: DurationTargetSec;
  /** voyage (default) vs invitation (guest playback, no edit) */
  mode?: "voyage" | "invitation";
  /** Event type label for invitation packs (Birthday, Wedding, …) */
  eventType?: string;
  /** Prefill title when applying the pack */
  defaultTitle?: string;
  /** Starter timed overlays (emoji accents welcome) */
  defaultOverlays?: Array<{
    value: string;
    role?: "title" | "subtitle" | "caption";
  }>;
  /** Hero emoji for invitation gallery / empty-stage watermark */
  eventEmoji?: string;
  /** One-line vibe shown on invitation template cards */
  vibe?: string;
  /** Optional host field placeholder when applying */
  hostPlaceholder?: string;
  /** Extra emoji accents (merged into overlays if no text overlays yet) */
  defaultEmojis?: string[];
}

export interface AudioBeatPack {
  id: string;
  kind: "audio-beat";
  version: string;
  name: string;
  bpm: number;
  mood: string[];
  license: "personal" | "creator" | "commercial" | "preview";
  tier: PackTier;
  previewUrl?: string;
  beatmapUrl?: string;
  /** Free-track attribution / source note (shown in catalog docs) */
  attribution?: string;
  previewNote?: string;
}

export interface CatalogManifest {
  schema: 1;
  catalogVersion: string;
  etag: string;
  generatedAt: string;
  channels: Record<string, { minApp: string }>;
  packs: Array<
    | (ThemePack & { sizeBytes?: number; hash?: string; url?: string })
    | (TemplatePack & { sizeBytes?: number; hash?: string })
    | (AudioBeatPack & { sizeBytes?: number; hash?: string })
    | {
        id: string;
        kind: PackKind;
        version: string;
        name?: string;
        tier: PackTier;
        tags?: string[];
      }
  >;
  tombstones: string[];
}

export function packRef(id: string, version: string): string {
  return `${id}@${version}`;
}

export function parsePackRef(ref: string): { id: string; version: string } {
  const at = ref.lastIndexOf("@");
  if (at < 0) throw new Error(`Invalid pack ref: ${ref}`);
  return { id: ref.slice(0, at), version: ref.slice(at + 1) };
}

export function textStyleLabel(kind: TextStyleKind): string {
  switch (kind) {
    case "bold-impact":
      return "Bold impact";
    case "soft-serif":
      return "Soft serif";
    case "clean-sans":
      return "Clean sans";
    case "script-soft":
      return "Script soft";
    case "mono-tech":
      return "Mono tech";
    case "vintage-poster":
      return "Vintage poster";
    case "caption-pill":
      return "Caption pill";
    case "kinetic-outline":
      return "Kinetic outline";
    default:
      return kind;
  }
}

export function textTransitionLabel(kind: TextTransitionKind): string {
  switch (kind) {
    case "fade":
      return "Fade";
    case "pop":
      return "Pop";
    case "slide-up":
      return "Slide up";
    case "typewriter":
      return "Typewriter";
    case "whip-in":
      return "Whip in";
    case "scale-bounce":
      return "Scale bounce";
    case "dissolve":
      return "Dissolve";
    case "flash-in":
      return "Flash in";
    default:
      return kind;
  }
}

export function transitionLabel(kind: TransitionKind): string {
  switch (kind) {
    case "cut":
      return "Cut";
    case "dissolve":
      return "Dissolve";
    case "push":
      return "Push";
    case "whip":
      return "Whip";
    case "light-leak":
      return "Light leak";
    case "fade-black":
      return "Fade black";
    case "zoom-through":
      return "Zoom through";
    case "slide-up":
      return "Slide up";
    case "flash":
      return "Flash";
    case "slide-left":
      return "Slide left";
    case "slide-right":
      return "Slide right";
    case "circle-wipe":
      return "Circle wipe";
    case "blur-fade":
      return "Blur fade";
    case "spin":
      return "Spin";
    case "glitch":
      return "Glitch";
    case "heart-wipe":
      return "Heart wipe";
    case "soft-bloom":
      return "Soft bloom";
    default:
      return kind;
  }
}

/** Small emoji icon suggesting the transition feel (UI chips / HUD). */
export function transitionIcon(kind: TransitionKind): string {
  switch (kind) {
    case "cut":
      return "✂";
    case "dissolve":
      return "◌";
    case "push":
      return "⇨";
    case "whip":
      return "⟲";
    case "light-leak":
      return "☀";
    case "fade-black":
      return "⬤";
    case "zoom-through":
      return "◎";
    case "slide-up":
      return "⇧";
    case "flash":
      return "⚡";
    case "slide-left":
      return "⇦";
    case "slide-right":
      return "⇨";
    case "circle-wipe":
      return "◯";
    case "blur-fade":
      return "≋";
    case "spin":
      return "↻";
    case "glitch":
      return "▞";
    case "heart-wipe":
      return "♥";
    case "soft-bloom":
      return "❀";
    default:
      return "✦";
  }
}
