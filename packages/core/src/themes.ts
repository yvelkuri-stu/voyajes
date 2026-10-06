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
  | "light-leak";

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
}

export interface CatalogManifest {
  schema: 1;
  catalogVersion: string;
  etag: string;
  generatedAt: string;
  channels: Record<string, { minApp: string }>;
  packs: Array<
    | (ThemePack & { sizeBytes?: number; hash?: string; url?: string })
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
