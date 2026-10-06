import { z } from "zod";

export const AspectSchema = z.enum(["9:16", "16:9", "1:1", "4:5"]);
export type Aspect = z.infer<typeof AspectSchema>;

export const BeatSyncSchema = z.enum(["off", "soft", "medium", "hard"]);
export type BeatSync = z.infer<typeof BeatSyncSchema>;

export const LicenseSchema = z.enum([
  "personal",
  "creator",
  "commercial",
  "preview",
]);
export type License = z.infer<typeof LicenseSchema>;

export const PackRefSchema = z
  .string()
  .regex(
    /^[\w.-]+@\d+\.\d+\.\d+$/,
    "Pack ref must look like id@version (e.g. theme.ocean-pop@1.0.0)",
  );

export const TransitionKindSchema = z.enum([
  "cut",
  "dissolve",
  "push",
  "whip",
  "light-leak",
  "fade-black",
  "zoom-through",
  "slide-up",
  "flash",
]);
export type TransitionKindSchemaType = z.infer<typeof TransitionKindSchema>;

export const TextStyleSchema = z.enum([
  "bold-impact",
  "soft-serif",
  "clean-sans",
  "script-soft",
  "mono-tech",
  "vintage-poster",
  "caption-pill",
  "kinetic-outline",
]);
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const TextTransitionSchema = z.enum([
  "fade",
  "pop",
  "slide-up",
  "typewriter",
  "whip-in",
  "scale-bounce",
  "dissolve",
  "flash-in",
]);
export type TextTransition = z.infer<typeof TextTransitionSchema>;

export const TextPositionSchema = z.enum([
  "top",
  "center",
  "bottom",
  "lower-third",
]);
export type TextPosition = z.infer<typeof TextPositionSchema>;

export const DurationTargetSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);
export type DurationTarget = z.infer<typeof DurationTargetSchema>;

export const ExportDestinationSchema = z.enum([
  "youtube",
  "tiktok",
  "instagram-reels",
  "instagram-feed",
  "instagram-portrait",
  "custom",
]);
export type ExportDestination = z.infer<typeof ExportDestinationSchema>;

export const MediaClipSchema = z.object({
  path: z.string().min(1),
  mute: z.boolean().optional().default(false),
  durationSec: z.number().positive().optional(),
  /**
   * Transition used when leaving this clip into the next
   * (gap after this clip on the filmstrip). Omit = project/theme default.
   */
  transitionOut: TransitionKindSchema.optional(),
});

/**
 * Optional explicit edge list (after clip index → kind).
 * Prefer media[].transitionOut; edges are merged when present.
 */
export const TransitionEdgeSchema = z.object({
  afterIndex: z.number().int().nonnegative(),
  kind: TransitionKindSchema,
});
export type TransitionEdge = z.infer<typeof TransitionEdgeSchema>;

/** Catalog pack ref OR custom:<id> for imported sounds */
export const AudioTrackRefSchema = z.string().min(1);

export const CustomSoundSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  source: z.enum(["file", "url"]),
  /** Remote URL when source=url (CORS may block browser fetch) */
  url: z.string().optional(),
  /** Project-relative or local:sound:<id>/… path for CLI / IndexedDB */
  path: z.string().optional(),
});
export type CustomSound = z.infer<typeof CustomSoundSchema>;

export const AudioMixModeSchema = z.enum(["replace", "mix"]);
export type AudioMixMode = z.infer<typeof AudioMixModeSchema>;

export const AudioTrackSchema = z.object({
  track: AudioTrackRefSchema.optional(),
  beatSync: BeatSyncSchema.default("medium"),
  ducking: z.boolean().default(true),
  /** replace catalog beat with custom, or mix custom under/alongside catalog */
  mixMode: AudioMixModeSchema.optional().default("replace"),
  customSounds: z.array(CustomSoundSchema).optional(),
});

export const TextCardSchema = z.object({
  id: z.string().optional(),
  at: z.number().nonnegative(),
  /** Exclusive end time on the timeline (seconds). Default: at + durationSec or project end. */
  end: z.number().nonnegative().optional(),
  durationSec: z.number().positive().optional(),
  role: z.enum(["title", "subtitle", "caption"]),
  value: z.string(),
  style: TextStyleSchema.optional(),
  color: z.string().optional(),
  position: TextPositionSchema.optional(),
  animationIn: TextTransitionSchema.optional(),
  animationOut: TextTransitionSchema.optional(),
});
export type TextCard = z.infer<typeof TextCardSchema>;

export const ShareMetaSchema = z.object({
  title: z.string().optional(),
  public: z.boolean().default(true),
  password: z.boolean().optional(),
  id: z.string().min(4).optional(),
});

export const ExportMetaSchema = z.object({
  destination: ExportDestinationSchema.optional(),
  watermark: z.boolean().optional().default(false),
  durationTargetSec: DurationTargetSchema.optional(),
});

/** Voyajes project file — shared by GUI and CLI */
export const VoyajesProjectSchema = z.object({
  schema: z.literal(1),
  title: z.string().min(1),
  aspect: AspectSchema.default("9:16"),
  theme: PackRefSchema,
  /** Optional full template pack (theme + beat + text defaults) */
  template: PackRefSchema.optional(),
  motion: PackRefSchema.optional(),
  media: z.array(MediaClipSchema).default([]),
  /** Global default transition when a clip has no transitionOut */
  transition: TransitionKindSchema.optional(),
  transitionEdges: z.array(TransitionEdgeSchema).optional(),
  audio: AudioTrackSchema.optional(),
  text: z.array(TextCardSchema).optional(),
  textStyle: TextStyleSchema.optional(),
  textTransition: TextTransitionSchema.optional(),
  captionStyle: TextStyleSchema.optional(),
  share: ShareMetaSchema.optional(),
  export: ExportMetaSchema.optional(),
});

export type VoyajesProject = z.infer<typeof VoyajesProjectSchema>;
export type MediaClip = z.infer<typeof MediaClipSchema>;

export function parseProject(data: unknown): VoyajesProject {
  return VoyajesProjectSchema.parse(data);
}

export function safeParseProject(data: unknown) {
  return VoyajesProjectSchema.safeParse(data);
}

/** Resolve the transition used when entering clip at `toIndex` (from previous). */
export function resolveTransitionAt(
  project: Pick<VoyajesProject, "media" | "transition" | "transitionEdges">,
  toIndex: number,
  fallback: z.infer<typeof TransitionKindSchema>,
): z.infer<typeof TransitionKindSchema> {
  if (toIndex <= 0) return "cut";
  const fromIndex = toIndex - 1;
  const edge = project.transitionEdges?.find((e) => e.afterIndex === fromIndex);
  if (edge) return edge.kind;
  const fromClip = project.media[fromIndex];
  if (fromClip?.transitionOut) return fromClip.transitionOut;
  if (project.transition) return project.transition;
  return fallback;
}

/** Inclusive start / exclusive-ish end for a text card on the timeline. */
export function textCardRange(
  card: TextCard,
  projectEndSec: number,
): { start: number; end: number } {
  const start = Math.max(0, card.at);
  let end = projectEndSec;
  if (typeof card.end === "number" && Number.isFinite(card.end)) {
    end = card.end;
  } else if (
    typeof card.durationSec === "number" &&
    Number.isFinite(card.durationSec)
  ) {
    end = start + card.durationSec;
  }
  return { start, end: Math.max(start, end) };
}

export function isTextCardActive(
  card: TextCard,
  timeSec: number,
  projectEndSec: number,
): boolean {
  const { start, end } = textCardRange(card, projectEndSec);
  return timeSec >= start && timeSec < end;
}
