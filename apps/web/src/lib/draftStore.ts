import type {
  Aspect,
  AudioMixMode,
  BeatSync,
  CustomSound,
  DurationTarget,
  ExportDestination,
  ProjectMode,
  TextCard,
  TextPosition,
  TextStyle,
  TextTransition,
  TransitionKindSchemaType,
  VoyajesProject,
} from "@voyajes/core";
import { packRef, safeParseProject } from "@voyajes/core";
import type { TransitionKind } from "@voyajes/core";

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
  /** Transition into the next clip (filmstrip gap after this clip). */
  transitionOut?: TransitionKind | null;
  /**
   * In-memory / portable-pack only — object URL or data URL for guest playback
   * without IndexedDB. Not persisted to localStorage drafts.
   */
  portableUrl?: string;
};

export type DraftTextOverlay = {
  id: string;
  at: number;
  end: number;
  role: "title" | "subtitle" | "caption";
  value: string;
  style: TextStyle;
  color: string;
  position: TextPosition;
  animationIn: TextTransition;
  animationOut: TextTransition;
};

export type DraftCustomSound = CustomSound & {
  /** object URL resolved at runtime from IndexedDB / remote URL */
};

export type DraftState = {
  title: string;
  /** voyage (story) vs invitation (guest playback share) */
  mode: ProjectMode;
  aspect: Aspect;
  themeId: string;
  themeVersion: string;
  templateId?: string;
  templateVersion?: string;
  audioTrackRef: string;
  beatSync: BeatSync;
  ducking: boolean;
  audioMixMode: AudioMixMode;
  customSounds: CustomSound[];
  textStyle: TextStyle;
  textTransition: TextTransition;
  captionStyle: TextStyle;
  /** Overlay caption under title (emoji OK) — legacy single caption. */
  captionText: string;
  /** Timed text overlays on the timeline. */
  textOverlays: DraftTextOverlay[];
  /** Global default transition (null = theme default). */
  transitionOverride: TransitionKind | null;
  watermark: boolean;
  durationTargetSec?: DurationTarget;
  exportDestination: ExportDestination;
  clips: DraftClipMeta[];
  shareId?: string;
  sharePassword?: boolean;
  /** Invitation who/what/when/where (mode=invitation) */
  hostName?: string;
  guestName?: string;
  eventName?: string;
  eventType?: string;
  eventWhen?: string;
  eventWhere?: string;
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

const TEXT_POS: TextPosition[] = ["top", "center", "bottom", "lower-third"];

const DESTINATIONS: ExportDestination[] = [
  "youtube",
  "tiktok",
  "instagram-reels",
  "instagram-feed",
  "instagram-portrait",
  "custom",
];

const TRANSITIONS: TransitionKind[] = [
  "cut",
  "dissolve",
  "push",
  "whip",
  "light-leak",
  "fade-black",
  "zoom-through",
  "slide-up",
  "flash",
];

export function defaultDraft(themeId = "theme.ocean-pop"): DraftState {
  return {
    title: "Untitled voyage",
    mode: "voyage",
    aspect: "9:16",
    themeId,
    themeVersion: "1.0.0",
    templateId: undefined,
    templateVersion: undefined,
    audioTrackRef: "audio.ocean-drift-084@1.0.0",
    beatSync: "medium",
    ducking: true,
    audioMixMode: "replace",
    customSounds: [],
    textStyle: "clean-sans",
    textTransition: "fade",
    captionStyle: "caption-pill",
    captionText: "",
    textOverlays: [],
    transitionOverride: null,
    watermark: false,
    durationTargetSec: undefined,
    exportDestination: "custom",
    clips: [],
    shareId: undefined,
    sharePassword: false,
    hostName: "",
    guestName: "",
    eventName: "",
    eventType: "",
    eventWhen: "",
    eventWhere: "",
    updatedAt: new Date().toISOString(),
  };
}

function asTextStyle(v: unknown, fallback: TextStyle): TextStyle {
  return TEXT_STYLES.includes(v as TextStyle) ? (v as TextStyle) : fallback;
}

function asTextTx(v: unknown, fallback: TextTransition): TextTransition {
  return TEXT_TX.includes(v as TextTransition) ? (v as TextTransition) : fallback;
}

function asTextPos(v: unknown, fallback: TextPosition): TextPosition {
  return TEXT_POS.includes(v as TextPosition) ? (v as TextPosition) : fallback;
}

function asTransition(v: unknown): TransitionKind | null {
  if (v == null) return null;
  return TRANSITIONS.includes(v as TransitionKind) ? (v as TransitionKind) : null;
}

function normalizeOverlay(raw: Partial<DraftTextOverlay>): DraftTextOverlay | null {
  if (!raw || typeof raw.value !== "string") return null;
  const id =
    typeof raw.id === "string" && raw.id
      ? raw.id
      : newClipId();
  const at = typeof raw.at === "number" && Number.isFinite(raw.at) ? Math.max(0, raw.at) : 0;
  const end =
    typeof raw.end === "number" && Number.isFinite(raw.end)
      ? Math.max(at, raw.end)
      : at + 3;
  return {
    id,
    at,
    end,
    role:
      raw.role === "subtitle" || raw.role === "caption" || raw.role === "title"
        ? raw.role
        : "caption",
    value: raw.value,
    style: asTextStyle(raw.style, "clean-sans"),
    color: typeof raw.color === "string" && raw.color ? raw.color : "#ffffff",
    position: asTextPos(raw.position, "bottom"),
    animationIn: asTextTx(raw.animationIn, "fade"),
    animationOut: asTextTx(raw.animationOut, "fade"),
  };
}

function normalizeCustomSound(raw: Partial<CustomSound>): CustomSound | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  if (raw.source !== "file" && raw.source !== "url") return null;
  return {
    id: raw.id,
    name: raw.name,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : undefined,
    source: raw.source,
    url: typeof raw.url === "string" ? raw.url : undefined,
    path: typeof raw.path === "string" ? raw.path : undefined,
  };
}

function normalizeClip(c: Partial<DraftClipMeta>): DraftClipMeta | null {
  if (!c || typeof c.id !== "string" || typeof c.fileName !== "string") return null;
  const kind = c.kind === "video" || c.kind === "image" ? c.kind : null;
  if (!kind) return null;
  return {
    id: c.id,
    fileName: c.fileName,
    mimeType: typeof c.mimeType === "string" ? c.mimeType : "application/octet-stream",
    kind,
    durationSec:
      typeof c.durationSec === "number" && Number.isFinite(c.durationSec)
        ? Math.min(60, Math.max(0.5, c.durationSec))
        : 2.8,
    mute: c.mute === true,
    transitionOut: asTransition(c.transitionOut),
  };
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
  const audioMixMode: AudioMixMode =
    parsed.audioMixMode === "mix" ? "mix" : "replace";
  const clips = parsed.clips
    .map((c) => normalizeClip(c))
    .filter((c): c is DraftClipMeta => Boolean(c));
  const textOverlays = Array.isArray(parsed.textOverlays)
    ? parsed.textOverlays
        .map((o) => normalizeOverlay(o as Partial<DraftTextOverlay>))
        .filter((o): o is DraftTextOverlay => Boolean(o))
    : [];
  const customSounds = Array.isArray(parsed.customSounds)
    ? parsed.customSounds
        .map((s) => normalizeCustomSound(s as Partial<CustomSound>))
        .filter((s): s is CustomSound => Boolean(s))
    : [];
  const mode: ProjectMode =
    parsed.mode === "invitation" ? "invitation" : "voyage";
  return {
    title: parsed.title,
    mode,
    aspect: (parsed.aspect as Aspect) ?? "9:16",
    themeId: parsed.themeId ?? "theme.ocean-pop",
    themeVersion: parsed.themeVersion ?? "1.0.0",
    templateId: typeof parsed.templateId === "string" ? parsed.templateId : undefined,
    templateVersion:
      typeof parsed.templateVersion === "string" ? parsed.templateVersion : undefined,
    audioTrackRef: parsed.audioTrackRef ?? "audio.ocean-drift-084@1.0.0",
    beatSync,
    ducking: parsed.ducking !== false,
    audioMixMode,
    customSounds,
    textStyle: asTextStyle(parsed.textStyle, "clean-sans"),
    textTransition: asTextTx(parsed.textTransition, "fade"),
    captionStyle: asTextStyle(parsed.captionStyle, "caption-pill"),
    captionText: typeof parsed.captionText === "string" ? parsed.captionText : "",
    textOverlays,
    transitionOverride: asTransition(parsed.transitionOverride),
    watermark: parsed.watermark === true,
    durationTargetSec,
    exportDestination,
    clips,
    shareId: typeof parsed.shareId === "string" ? parsed.shareId : undefined,
    sharePassword: parsed.sharePassword === true,
    hostName: typeof parsed.hostName === "string" ? parsed.hostName : "",
    guestName: typeof parsed.guestName === "string" ? parsed.guestName : "",
    eventName: typeof parsed.eventName === "string" ? parsed.eventName : "",
    eventType: typeof parsed.eventType === "string" ? parsed.eventType : "",
    eventWhen: typeof parsed.eventWhen === "string" ? parsed.eventWhen : "",
    eventWhere: typeof parsed.eventWhere === "string" ? parsed.eventWhere : "",
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
  const overlays: TextCard[] = draft.textOverlays
    .filter((o) => o.value.trim())
    .map((o) => ({
      id: o.id,
      at: o.at,
      end: o.end,
      role: o.role,
      value: o.value.trim(),
      style: o.style,
      color: o.color,
      position: o.position,
      animationIn: o.animationIn,
      animationOut: o.animationOut,
    }));

  const legacyText: TextCard[] = [
    {
      at: 0,
      role: "title",
      value: draft.title.trim() || "Untitled voyage",
      style: draft.textStyle,
      animationIn: draft.textTransition,
      position: "bottom",
    },
    ...(draft.captionText.trim()
      ? [
          {
            at: 0.4,
            role: "caption" as const,
            value: draft.captionText.trim(),
            style: draft.captionStyle,
            position: "lower-third" as const,
          },
        ]
      : []),
  ];

  const transitionEdges = draft.clips
    .map((c, i) =>
      c.transitionOut
        ? { afterIndex: i, kind: c.transitionOut as TransitionKindSchemaType }
        : null,
    )
    .filter((e): e is { afterIndex: number; kind: TransitionKindSchemaType } => Boolean(e));

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
      ...(c.transitionOut ? { transitionOut: c.transitionOut } : {}),
    })),
    ...(draft.transitionOverride
      ? { transition: draft.transitionOverride }
      : {}),
    ...(transitionEdges.length ? { transitionEdges } : {}),
    audio: {
      track: draft.audioTrackRef,
      beatSync: draft.beatSync,
      ducking: draft.ducking,
      mixMode: draft.audioMixMode,
      customSounds: draft.customSounds.length ? draft.customSounds : undefined,
    },
    text: [...legacyText, ...overlays],
    textStyle: draft.textStyle,
    textTransition: draft.textTransition,
    captionStyle: draft.captionStyle,
    share: {
      title: draft.title.trim() || "Untitled voyage",
      public: draft.sharePassword !== true,
      password: draft.sharePassword === true,
      id: draft.shareId,
      mode: draft.mode,
      ...(draft.mode === "invitation"
        ? {
            invitation: {
              hostName: draft.hostName?.trim() || undefined,
              guestName: draft.guestName?.trim() || undefined,
              eventName: draft.eventName?.trim() || undefined,
              eventType: draft.eventType?.trim() || undefined,
              eventWhen: draft.eventWhen?.trim() || undefined,
              eventWhere: draft.eventWhere?.trim() || undefined,
            },
          }
        : {}),
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

export function newOverlayId(): string {
  return `text-${newClipId()}`;
}

export function newSoundId(): string {
  return `sound-${newClipId()}`;
}

export function soundBlobKey(id: string): string {
  return `sound:${id}`;
}

export function isCustomTrackRef(ref: string): boolean {
  return ref.startsWith("custom:");
}

export function customIdFromTrackRef(ref: string): string | null {
  if (!isCustomTrackRef(ref)) return null;
  return ref.slice("custom:".length) || null;
}

export function clipKindFromMime(mime: string, name: string): ClipKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  const lower = name.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|bmp|heic)$/.test(lower)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/.test(lower)) return "video";
  return null;
}

export function audioKindFromMime(mime: string, name: string): boolean {
  if (mime.startsWith("audio/")) return true;
  const lower = name.toLowerCase();
  return /\.(mp3|wav|m4a|ogg|aac|flac|opus)$/.test(lower);
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

/** Transition into clip at `toIndex` given previous clip's transitionOut + global default. */
export function transitionIntoClip(
  clips: DraftClipMeta[],
  toIndex: number,
  globalDefault: TransitionKind,
): TransitionKind {
  if (toIndex <= 0) return "cut";
  const prev = clips[toIndex - 1];
  if (prev?.transitionOut) return prev.transitionOut;
  return globalDefault;
}

export function defaultTextOverlay(
  at = 0,
  end = 3,
  value = "New text",
): DraftTextOverlay {
  return {
    id: newOverlayId(),
    at,
    end,
    role: "caption",
    value,
    style: "clean-sans",
    color: "#ffffff",
    position: "center",
    animationIn: "fade",
    animationOut: "fade",
  };
}
