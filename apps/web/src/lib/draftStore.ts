import type {
  Aspect,
  BeatSync,
  DurationTarget,
  ExportDestination,
  TextStyle,
  TextTransition,
  VoyajesProject,
} from "@voyajes/core";
import { packRef, safeParseProject } from "@voyajes/core";

const LS_DRAFT = "voyajes.draft.v1";
const LS_PROJECT = "voyajes.project.draft.json";
const DB_NAME = "voyajes-media-v1";
const DB_STORE = "blobs";
const DB_VERSION = 1;

export type ClipKind = "image" | "video";

export type DraftClipMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  kind: ClipKind;
  durationSec: number;
  mute: boolean;
};

export type DraftState = {
  title: string;
  aspect: Aspect;
  themeId: string;
  themeVersion: string;
  templateId?: string;
  templateVersion?: string;
  audioTrackRef: string;
  beatSync: BeatSync;
  ducking: boolean;
  textStyle: TextStyle;
  textTransition: TextTransition;
  captionStyle: TextStyle;
  watermark: boolean;
  durationTargetSec?: DurationTarget;
  exportDestination: ExportDestination;
  clips: DraftClipMeta[];
  /** Stable public share id (local stub until cloud). */
  shareId?: string;
  /** When true, share page asks for a password (local stub). */
  sharePassword?: boolean;
  updatedAt: string;
};

const TEXT_STYLES: TextStyle[] = [
  "bold-impact",
  "soft-serif",
  "clean-sans",
  "script-soft",
  "mono-tech",
  "vintage-poster",
  "caption-pill",
  "kinetic-outline",
];

const TEXT_TX: TextTransition[] = [
  "fade",
  "pop",
  "slide-up",
  "typewriter",
  "whip-in",
  "scale-bounce",
  "dissolve",
  "flash-in",
];

const DESTINATIONS: ExportDestination[] = [
  "youtube",
  "tiktok",
  "instagram-reels",
  "instagram-feed",
  "instagram-portrait",
  "custom",
];

export function defaultDraft(themeId = "theme.ocean-pop"): DraftState {
  return {
    title: "Untitled voyage",
    aspect: "9:16",
    themeId,
    themeVersion: "1.0.0",
    templateId: undefined,
    templateVersion: undefined,
    audioTrackRef: "audio.ocean-drift-084@1.0.0",
    beatSync: "medium",
    ducking: true,
    textStyle: "clean-sans",
    textTransition: "fade",
    captionStyle: "caption-pill",
    watermark: false,
    durationTargetSec: undefined,
    exportDestination: "custom",
    clips: [],
    shareId: undefined,
    sharePassword: false,
    updatedAt: new Date().toISOString(),
  };
}

function asTextStyle(v: unknown, fallback: TextStyle): TextStyle {
  return TEXT_STYLES.includes(v as TextStyle) ? (v as TextStyle) : fallback;
}

function asTextTx(v: unknown, fallback: TextTransition): TextTransition {
  return TEXT_TX.includes(v as TextTransition) ? (v as TextTransition) : fallback;
}

function normalizeDraft(parsed: Partial<DraftState> & { clips?: DraftClipMeta[] }): DraftState | null {
  if (!parsed || typeof parsed.title !== "string" || !Array.isArray(parsed.clips)) {
    return null;
  }
  const beatSync = (["off", "soft", "medium", "hard"] as BeatSync[]).includes(
    parsed.beatSync as BeatSync,
  )
    ? (parsed.beatSync as BeatSync)
    : "medium";
  const durationTargetSec =
    parsed.durationTargetSec === 15 ||
    parsed.durationTargetSec === 30 ||
    parsed.durationTargetSec === 60
      ? parsed.durationTargetSec
      : undefined;
  const exportDestination = DESTINATIONS.includes(
    parsed.exportDestination as ExportDestination,
  )
    ? (parsed.exportDestination as ExportDestination)
    : "custom";
  return {
    title: parsed.title,
    aspect: (parsed.aspect as Aspect) ?? "9:16",
    themeId: parsed.themeId ?? "theme.ocean-pop",
    themeVersion: parsed.themeVersion ?? "1.0.0",
    templateId: typeof parsed.templateId === "string" ? parsed.templateId : undefined,
    templateVersion:
      typeof parsed.templateVersion === "string" ? parsed.templateVersion : undefined,
    audioTrackRef: parsed.audioTrackRef ?? "audio.ocean-drift-084@1.0.0",
    beatSync,
    ducking: parsed.ducking !== false,
    textStyle: asTextStyle(parsed.textStyle, "clean-sans"),
    textTransition: asTextTx(parsed.textTransition, "fade"),
    captionStyle: asTextStyle(parsed.captionStyle, "caption-pill"),
    watermark: parsed.watermark === true,
    durationTargetSec,
    exportDestination,
    clips: parsed.clips,
    shareId: typeof parsed.shareId === "string" ? parsed.shareId : undefined,
    sharePassword: parsed.sharePassword === true,
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  };
}

export function loadDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    if (!raw) return null;
    return normalizeDraft(JSON.parse(raw) as Partial<DraftState>);
  } catch {
    return null;
  }
}

export function saveDraft(draft: DraftState): void {
  const next = { ...draft, updatedAt: new Date().toISOString() };
  localStorage.setItem(LS_DRAFT, JSON.stringify(next));
  localStorage.setItem(LS_PROJECT, JSON.stringify(toVoyajesProject(next), null, 2));
}

export function clearDraft(): void {
  localStorage.removeItem(LS_DRAFT);
  localStorage.removeItem(LS_PROJECT);
}

export function toVoyajesProject(draft: DraftState): VoyajesProject {
  const project: VoyajesProject = {
    schema: 1,
    title: draft.title.trim() || "Untitled voyage",
    aspect: draft.aspect,
    theme: packRef(draft.themeId, draft.themeVersion),
    template:
      draft.templateId && draft.templateVersion
        ? packRef(draft.templateId, draft.templateVersion)
        : undefined,
    media: draft.clips.map((c) => ({
      path: `local:${c.id}/${c.fileName}`,
      mute: c.mute,
      durationSec: c.durationSec,
    })),
    audio: {
      track: draft.audioTrackRef,
      beatSync: draft.beatSync,
      ducking: draft.ducking,
    },
    text: [
      {
        at: 0,
        role: "title",
        value: draft.title.trim() || "Untitled voyage",
      },
    ],
    textStyle: draft.textStyle,
    textTransition: draft.textTransition,
    captionStyle: draft.captionStyle,
    share: {
      title: draft.title.trim() || "Untitled voyage",
      public: draft.sharePassword !== true,
      password: draft.sharePassword === true,
      id: draft.shareId,
    },
    export: {
      destination: draft.exportDestination,
      watermark: draft.watermark,
      durationTargetSec: draft.durationTargetSec,
    },
  };
  return project;
}

/** Validate the JSON we persist matches core schema (best-effort). */
export function validatePersistedProject(): { ok: boolean; issues?: string } {
  try {
    const raw = localStorage.getItem(LS_PROJECT);
    if (!raw) return { ok: false, issues: "no project json" };
    const result = safeParseProject(JSON.parse(raw));
    if (!result.success) {
      return { ok: false, issues: result.error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, issues: e instanceof Error ? e.message : String(e) };
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("putBlob failed"));
  });
  db.close();
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error ?? new Error("getBlob failed"));
  });
  db.close();
  return blob;
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("deleteBlob failed"));
  });
  db.close();
}

export async function clearAllBlobs(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("clearAllBlobs failed"));
  });
  db.close();
}

export function newClipId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function clipKindFromMime(mime: string, name: string): ClipKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  const lower = name.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|bmp|heic)$/.test(lower)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/.test(lower)) return "video";
  return null;
}

export function defaultImageDuration(motion: string): number {
  if (motion === "cinematic" || motion === "float") return 3.2;
  if (motion === "snappy") return 2.2;
  return 2.8;
}

export async function readVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const d = Number.isFinite(video.duration) ? video.duration : 4;
        resolve(Math.min(Math.max(d, 0.5), 60));
      };
      video.onerror = () => resolve(4);
      video.src = url;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}
