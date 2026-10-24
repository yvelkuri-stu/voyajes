/**
 * Voyajes free media library — curated abstract photos + real, licence-verified audio
 * (CC0 / public domain / CC BY — see public/library/LIBRARY.md and the Credits page).
 */
import manifesto from "../../public/library/manifest.json";
import { assetUrl } from "../lib/assetUrl";

export type LibraryKind = "photo" | "audio" | "video";

export type LibraryItem = {
  id: string;
  title: string;
  kind: LibraryKind;
  tags: string[];
  url: string;
  thumbnail?: string;
  durationSec?: number;
  /** Audio: browser category (festive-indian, devotional, lullaby, upbeat, cinematic, chill, genz, sfx) */
  category?: string;
  audioType?: "loop" | "sfx";
  /** Measured on the shipped file (scripts/audio/build_audio_library.py) */
  bpm?: number;
  beatOffsetSec?: number;
  beatsPerBar?: number;
  pulse?: "steady" | "free";
  lufs?: number;
  sizeBytes?: number;
  /** 64 normalised waveform peaks (0..1) */
  peaks?: number[];
  credit?: AudioCredit;
  sample?: boolean;
  ceremony?: boolean;
};

export type AudioCredit = {
  work: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  note?: string;
};

type Manifest = {
  libraryVersion: string;
  items: LibraryItem[];
  audioCategories?: { id: string; label: string }[];
};

const manifest = manifesto as Manifest;

export const LIBRARY_VERSION = manifest.libraryVersion;

export function getLibraryItems(kind?: LibraryKind): LibraryItem[] {
  const items = manifest.items ?? [];
  if (!kind) return items;
  return items.filter((i) => i.kind === kind);
}

export function getLibraryItem(id: string): LibraryItem | undefined {
  return (manifest.items ?? []).find((i) => i.id === id);
}

export const AUDIO_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: "festive-indian", label: "Festive Indian", emoji: "🪔" },
  { id: "devotional", label: "Devotional", emoji: "🛕" },
  { id: "lullaby", label: "Lullaby", emoji: "🧸" },
  { id: "upbeat", label: "Upbeat", emoji: "🎉" },
  { id: "cinematic", label: "Cinematic", emoji: "🎬" },
  { id: "chill", label: "Chill", emoji: "🌊" },
  { id: "genz", label: "Gen Z", emoji: "⚡" },
  { id: "sfx", label: "SFX", emoji: "✨" },
];

/** One-line credit, e.g. “Vadodora” by Kevin MacLeod (incompetech.com) — CC BY 3.0 */
export function creditLine(c: AudioCredit | undefined): string {
  if (!c) return "";
  return `“${c.work}” by ${c.author} — ${c.license}`;
}

export function libraryAssetUrl(path: string): string {
  return assetUrl(path) ?? path;
}

export function libraryTags(): string[] {
  const set = new Set<string>();
  for (const item of manifest.items ?? []) {
    for (const t of item.tags) set.add(t);
  }
  return [...set].sort();
}

/** Pick a few library photos (+ optional ambient) for a template / theme vibe. */
export function defaultLibraryForTheme(input: {
  themeId?: string;
  tags?: string[];
  name?: string;
}): { photoIds: string[]; audioId: string } {
  const photos = getLibraryItems("photo");
  const audios = getLibraryItems("audio");
  const hay = `${input.themeId ?? ""} ${(input.tags ?? []).join(" ")} ${input.name ?? ""}`.toLowerCase();

  const score = (item: LibraryItem) =>
    item.tags.reduce((n, t) => n + (hay.includes(t) ? 2 : 0), 0);

  const ranked = [...photos].sort((a, b) => score(b) - score(a));
  // Stable fallback rotation from theme id hash
  const seed = [...(input.themeId ?? input.name ?? "voyajes")].reduce(
    (a, c) => a + c.charCodeAt(0),
    0,
  );
  const pick: LibraryItem[] = [];
  if (ranked[0] && score(ranked[0]) > 0) {
    pick.push(ranked[0]);
    if (ranked[1] && score(ranked[1]) > 0) pick.push(ranked[1]);
  }
  while (pick.length < 2 && photos.length) {
    const next = photos[(seed + pick.length * 3) % photos.length];
    if (!pick.find((p) => p.id === next.id)) pick.push(next);
    else break;
  }
  if (pick.length < 3 && photos.length >= 3) {
    const next = photos[(seed + 7) % photos.length];
    if (!pick.find((p) => p.id === next.id)) pick.push(next);
  }

  const audioRanked = [...audios].sort((a, b) => score(b) - score(a));
  const audio =
    (audioRanked[0] && score(audioRanked[0]) > 0
      ? audioRanked[0]
      : audios[seed % audios.length]) ?? audios[0];

  return {
    photoIds: pick.map((p) => p.id),
    audioId: audio?.id ?? "lib.audio.soft-pad",
  };
}
