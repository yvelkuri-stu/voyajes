import { brand } from "@voyajes/core";
import type { Aspect, InvitationMeta, ProjectMode, TextStyle, TextTransition, TransitionKind } from "@voyajes/core";
import type { DraftClipMeta, DraftState, DraftTextOverlay } from "./draftStore";

const LS_SHARES = "voyajes.shares.v1";
const LS_ACTIVE = "voyajes.share.activeId";

/** Snapshot of compose intent so guest playback matches the host design. */
export type SharePlaybackSnapshot = {
  aspect: Aspect;
  themeId: string;
  transitionOverride: TransitionKind | null;
  textStyle: TextStyle;
  textTransition: TextTransition;
  captionStyle: TextStyle;
  captionText: string;
  textOverlays: DraftTextOverlay[];
  audioTrackRef: string;
  beatSync: DraftState["beatSync"];
  ducking: boolean;
  watermark: boolean;
  clips: DraftClipMeta[];
  invitation?: InvitationMeta;
  /** v2 timeline theme layer */
  grade?: DraftState["grade"];
  defaultAnimation?: DraftState["defaultAnimation"];
  transitionSpec?: DraftState["transitionSpec"];
  audioClips?: DraftState["audioClips"];
  autoDuck?: boolean;
};

export type ShareRecord = {
  id: string;
  title: string;
  mode: ProjectMode;
  themeId: string;
  themeName: string;
  themeAccent: string;
  themeGradient: string;
  clipCount: number;
  durationSec: number;
  audioTrackRef: string;
  audioName: string;
  audioBpm: number;
  /** First clip id for poster blob lookup */
  posterClipId: string | null;
  posterMime: string | null;
  passwordProtected: boolean;
  /** Full playback recipe (theme / transitions / text / clip meta). */
  playback: SharePlaybackSnapshot | null;
  /** Invitation who/what/when/where (mirrors draft + playback.invitation). */
  invitation?: InvitationMeta;
  createdAt: string;
  updatedAt: string;
};

type ShareIndex = Record<string, ShareRecord>;

function readIndex(): ShareIndex {
  try {
    const raw = localStorage.getItem(LS_SHARES);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ShareIndex;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeIndex(index: ShareIndex): void {
  localStorage.setItem(LS_SHARES, JSON.stringify(index));
}

/** Short, URL-safe share id (e.g. vj_k7m2p9xq). */
export function generateShareId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (const b of bytes) suffix += alphabet[b % alphabet.length];
  } else {
    suffix = Math.random().toString(36).slice(2, 10);
  }
  return `vj_${suffix}`;
}

export function publicShareUrl(id: string): string {
  // Prefer the live origin + Vite base so GitHub Pages (/voyajes/) works;
  // fall back to the marketing host for SSR / non-browser contexts.
  if (typeof window !== "undefined") {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    return `${window.location.origin}${base}/v/${id}`;
  }
  return `https://${brand.shareHost}/v/${id}`;
}


function normalizeInvitation(raw?: InvitationMeta | null): InvitationMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: InvitationMeta = {};
  if (typeof raw.hostName === "string" && raw.hostName.trim()) out.hostName = raw.hostName.trim();
  if (typeof raw.guestName === "string" && raw.guestName.trim()) out.guestName = raw.guestName.trim();
  if (typeof raw.eventName === "string" && raw.eventName.trim()) out.eventName = raw.eventName.trim();
  if (typeof raw.eventType === "string" && raw.eventType.trim()) out.eventType = raw.eventType.trim();
  if (typeof raw.eventWhen === "string" && raw.eventWhen.trim()) out.eventWhen = raw.eventWhen.trim();
  if (typeof raw.eventWhere === "string" && raw.eventWhere.trim()) out.eventWhere = raw.eventWhere.trim();
  return Object.keys(out).length ? out : undefined;
}

function normalizeRecord(raw: Partial<ShareRecord> & { id: string }): ShareRecord {
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "Untitled voyage",
    mode: raw.mode === "invitation" ? "invitation" : "voyage",
    themeId: raw.themeId ?? "theme.ocean-pop",
    themeName: raw.themeName ?? "Theme",
    themeAccent: raw.themeAccent ?? "#7C5CFF",
    themeGradient: raw.themeGradient ?? "var(--grad-brand)",
    clipCount: typeof raw.clipCount === "number" ? raw.clipCount : 0,
    durationSec: typeof raw.durationSec === "number" ? raw.durationSec : 0,
    audioTrackRef: raw.audioTrackRef ?? "",
    audioName: raw.audioName ?? "Beat",
    audioBpm: typeof raw.audioBpm === "number" ? raw.audioBpm : 0,
    posterClipId: raw.posterClipId ?? null,
    posterMime: raw.posterMime ?? null,
    passwordProtected: raw.passwordProtected === true,
    playback: raw.playback ?? null,
    invitation: normalizeInvitation(raw.invitation ?? raw.playback?.invitation),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

export function getShare(id: string): ShareRecord | null {
  const index = readIndex();
  const raw = index[id];
  return raw ? normalizeRecord(raw) : null;
}

export function getActiveShareId(): string | null {
  try {
    return localStorage.getItem(LS_ACTIVE);
  } catch {
    return null;
  }
}

export function setActiveShareId(id: string): void {
  localStorage.setItem(LS_ACTIVE, id);
}

export function saveShare(record: ShareRecord): void {
  const index = readIndex();
  index[record.id] = normalizeRecord(record);
  writeIndex(index);
  setActiveShareId(record.id);
}

export function updateShare(
  id: string,
  patch: Partial<ShareRecord>,
): ShareRecord | null {
  const index = readIndex();
  const prev = index[id];
  if (!prev) return null;
  const next = normalizeRecord({
    ...prev,
    ...patch,
    id: prev.id,
    updatedAt: new Date().toISOString(),
  });
  index[id] = next;
  writeIndex(index);
  return next;
}

export type ShareDraftContext = {
  themeName: string;
  themeAccent: string;
  themeGradient: string;
  audioName: string;
  audioBpm: number;
};

export function invitationFromDraft(draft: DraftState): InvitationMeta | undefined {
  return normalizeInvitation({
    hostName: draft.hostName,
    guestName: draft.guestName,
    eventName: draft.eventName,
    eventType: draft.eventType,
    eventWhen: draft.eventWhen,
    eventWhere: draft.eventWhere,
  });
}

export function playbackFromDraft(draft: DraftState): SharePlaybackSnapshot {
  const invitation = invitationFromDraft(draft);
  return {
    aspect: draft.aspect,
    themeId: draft.themeId,
    transitionOverride: draft.transitionOverride,
    textStyle: draft.textStyle,
    textTransition: draft.textTransition,
    captionStyle: draft.captionStyle,
    captionText: draft.captionText,
    textOverlays: draft.textOverlays,
    audioTrackRef: draft.audioTrackRef,
    beatSync: draft.beatSync,
    ducking: draft.ducking,
    watermark: draft.watermark,
    clips: draft.clips.map((c) => ({ ...c })),
    ...(invitation ? { invitation } : {}),
    ...(draft.grade ? { grade: draft.grade } : {}),
    ...(draft.defaultAnimation ? { defaultAnimation: draft.defaultAnimation } : {}),
    ...(draft.transitionSpec ? { transitionSpec: draft.transitionSpec } : {}),
    ...(Array.isArray(draft.audioClips) ? { audioClips: draft.audioClips } : {}),
    ...(typeof draft.autoDuck === "boolean" ? { autoDuck: draft.autoDuck } : {}),
  };
}

/** Create or refresh a share record from the current draft. */
export function ensureShareFromDraft(
  draft: DraftState,
  ctx: ShareDraftContext,
): ShareRecord {
  const now = new Date().toISOString();
  const prev = draft.shareId ? getShare(draft.shareId) : null;
  const id = prev?.id ?? draft.shareId ?? generateShareId();
  const first = draft.clips[0];
  const durationSec = draft.clips.reduce((s, c) => s + c.durationSec, 0);
  const record: ShareRecord = {
    id,
    title: draft.title.trim() || (draft.mode === "invitation" ? "You're invited!" : "Untitled voyage"),
    mode: draft.mode === "invitation" ? "invitation" : "voyage",
    themeId: draft.themeId,
    themeName: ctx.themeName,
    themeAccent: ctx.themeAccent,
    themeGradient: ctx.themeGradient,
    clipCount: draft.clips.length,
    durationSec,
    audioTrackRef: draft.audioTrackRef,
    audioName: ctx.audioName,
    audioBpm: ctx.audioBpm,
    posterClipId: first?.id ?? null,
    posterMime: first?.mimeType ?? null,
    passwordProtected: draft.sharePassword === true,
    playback: playbackFromDraft(draft),
    invitation: invitationFromDraft(draft),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  saveShare(record);
  return record;
}

export function listShares(): ShareRecord[] {
  return Object.values(readIndex())
    .map((r) => normalizeRecord(r))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function clearShares(): void {
  localStorage.removeItem(LS_SHARES);
  localStorage.removeItem(LS_ACTIVE);
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
