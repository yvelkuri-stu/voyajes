import type { Aspect, ExportDestination } from "@voyajes/core";

export type ExportPreset = {
  id: ExportDestination;
  label: string;
  platform: string;
  aspect: Aspect;
  /** Short edge pixels (1080p social default) */
  shortEdge: number;
  /** Suggested filename suffix before extension */
  filenameSuffix: string;
  /** Soft duration targets common on the platform */
  durationTargets: Array<15 | 30 | 60>;
  hint: string;
};

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "youtube",
    label: "YouTube",
    platform: "YouTube",
    aspect: "16:9",
    shortEdge: 1080,
    filenameSuffix: "yt-16x9-1080p",
    durationTargets: [60],
    hint: "Landscape 16:9 · 1080p · long-form or Shorts landscape",
  },
  {
    id: "tiktok",
    label: "TikTok",
    platform: "TikTok",
    aspect: "9:16",
    shortEdge: 1080,
    filenameSuffix: "tt-9x16",
    durationTargets: [15, 30, 60],
    hint: "Vertical 9:16 · 15 / 30 / 60s targets",
  },
  {
    id: "instagram-reels",
    label: "IG Reels",
    platform: "Instagram",
    aspect: "9:16",
    shortEdge: 1080,
    filenameSuffix: "ig-reels-9x16",
    durationTargets: [15, 30, 60],
    hint: "Vertical Reels 9:16",
  },
  {
    id: "instagram-feed",
    label: "IG Feed 1:1",
    platform: "Instagram",
    aspect: "1:1",
    shortEdge: 1080,
    filenameSuffix: "ig-feed-1x1",
    durationTargets: [30, 60],
    hint: "Square feed post 1:1",
  },
  {
    id: "instagram-portrait",
    label: "IG Feed 4:5",
    platform: "Instagram",
    aspect: "4:5",
    shortEdge: 1080,
    filenameSuffix: "ig-feed-4x5",
    durationTargets: [30, 60],
    hint: "Portrait feed 4:5",
  },
  {
    id: "custom",
    label: "Custom",
    platform: "Custom",
    aspect: "9:16",
    shortEdge: 1080,
    filenameSuffix: "",
    durationTargets: [15, 30, 60],
    hint: "Keep current aspect · pick your own",
  },
];

export function getExportPreset(id: ExportDestination): ExportPreset {
  return EXPORT_PRESETS.find((p) => p.id === id) ?? EXPORT_PRESETS[5];
}

export function exportFilename(
  title: string,
  preset: ExportPreset,
  extension: "webm" | "mp4" | "gif" | "webp",
): string {
  const base =
    title
      .trim()
      .replace(/[^\w\s-]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "voyajes-export";
  const suffix = preset.filenameSuffix ? `-${preset.filenameSuffix}` : "";
  return `${base}${suffix}.${extension}`;
}

/** CLI-friendly flag map for README / doctor hints */
export function cliFlagsForPreset(preset: ExportPreset): string {
  if (preset.id === "custom") {
    return `--aspect 9:16 --quality 1080p`;
  }
  return `--preset ${preset.id} --aspect ${preset.aspect} --quality 1080p`;
}
