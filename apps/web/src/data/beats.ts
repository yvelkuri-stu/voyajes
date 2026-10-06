import type { AudioBeatPack } from "@voyajes/core";
import { packRef } from "@voyajes/core";
import manifest from "../../public/catalog-manifest.json";

export type BeatCard = AudioBeatPack & {
  packRef: string;
};

export function getBeats(): BeatCard[] {
  const packs = manifest.packs as unknown as AudioBeatPack[];
  return packs
    .filter((p) => p.kind === "audio-beat")
    .map((p) => ({
      ...p,
      packRef: packRef(p.id, p.version),
    }));
}

export function getBeatByRef(ref: string): BeatCard | undefined {
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
