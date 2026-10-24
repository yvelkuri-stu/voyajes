import type { AudioBeatPack } from "@voyajes/core";
import { packRef } from "@voyajes/core";
import manifest from "../../public/catalog-manifest.json";
import { assetUrl } from "../lib/assetUrl";
import { getLibraryItem, getLibraryItems, libraryAssetUrl, type AudioCredit, type LibraryItem } from "./library";

export type BeatCard = AudioBeatPack & {
  packRef: string;
  category?: string;
  durationSec?: number;
  peaks?: number[];
  credit?: AudioCredit;
  /** true for Voyajes library tracks (ref `lib:lib.audio.*`) */
  library?: boolean;
  audioType?: "loop" | "sfx";
  pulse?: "steady" | "free";
  tags?: string[];
};

/** A library music track as a beat card, so selection + beat-sync use its measured BPM. */
export function libraryBeat(item: LibraryItem): BeatCard {
  return {
    id: item.id,
    kind: "audio-beat",
    version: "1.0.0",
    name: item.title,
    bpm: Math.round(item.bpm ?? 90),
    mood: item.tags.filter((t) => t !== "loop" && t !== "sfx" && t !== item.category).slice(0, 3),
    license: "creator",
    tier: "free",
    previewUrl: libraryAssetUrl(item.url),
    packRef: `lib:${item.id}`,
    category: item.category,
    durationSec: item.durationSec,
    peaks: item.peaks,
    credit: item.credit,
    library: true,
    audioType: item.audioType,
    pulse: item.pulse,
    tags: item.tags,
    attribution: item.credit ? `${item.credit.author} — ${item.credit.work} (${item.credit.license})` : undefined,
  };
}

/** Every track the audio browser offers: library recordings + catalog theme beats. */
export function getAllTracks(): BeatCard[] {
  const lib = getLibraryItems("audio").map(libraryBeat);
  return [...lib, ...getBeats()];
}

export function getBeats(): BeatCard[] {
  const packs = manifest.packs as unknown as AudioBeatPack[];
  return packs
    .filter((p) => p.kind === "audio-beat")
    .map((p) => ({
      ...p,
      previewUrl: assetUrl(p.previewUrl) ?? p.previewUrl,
      beatmapUrl: assetUrl(p.beatmapUrl) ?? p.beatmapUrl,
      packRef: packRef(p.id, p.version),
      library: false,
    }));
}

export function getBeatByRef(ref: string): BeatCard | undefined {
  if (ref.startsWith("lib:")) {
    const item = getLibraryItem(ref.slice(4));
    return item && item.kind === "audio" && item.audioType !== "sfx" ? libraryBeat(item) : undefined;
  }
  const beats = getBeats();
  const exact = beats.find((b) => b.packRef === ref);
  if (exact) return exact;
  const id = ref.includes("@") ? ref.slice(0, ref.lastIndexOf("@")) : ref;
  return beats.find((b) => b.id === id);
}

export function getBeatById(id: string): BeatCard | undefined {
  return getBeats().find((b) => b.id === id);
}

export function licenseLabel(license: AudioBeatPack["license"]): string {
  if (license === "creator") return "Creator";
  if (license === "commercial") return "Commercial";
  if (license === "preview") return "Preview";
  return "Personal";
}

export function licenseHint(license: AudioBeatPack["license"]): string {
  if (license === "creator") {
    return "OK for creator content & monetized posts (Voyajes license).";
  }
  if (license === "commercial") {
    return "Full commercial rights for ads & brand work.";
  }
  if (license === "preview") {
    return "Preview only — upgrade for export.";
  }
  return "Personal / non-commercial voyages.";
}
