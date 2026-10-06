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
});

export const AudioTrackSchema = z.object({
  track: PackRefSchema.optional(),
  beatSync: BeatSyncSchema.default("medium"),
  ducking: z.boolean().default(true),
});

export const TextCardSchema = z.object({
  at: z.number().nonnegative(),
  role: z.enum(["title", "subtitle", "caption"]),
  value: z.string(),
});

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
