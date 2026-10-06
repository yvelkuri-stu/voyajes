import { brand } from "@voyajes/core";
import type { DraftState } from "./draftStore";

const LS_SHARES = "voyajes.shares.v1";
const LS_ACTIVE = "voyajes.share.activeId";

export type ShareRecord = {
  id: string;
  title: string;
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
  return `https://${brand.shareHost}/v/${id}`;
}

export function getShare(id: string): ShareRecord | null {
  const index = readIndex();
  return index[id] ?? null;
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
  index[record.id] = record;
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
  const next: ShareRecord = {
    ...prev,
    ...patch,
    id: prev.id,
    updatedAt: new Date().toISOString(),
  };
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

/** Create or refresh a share record from the current draft. */
export function ensureShareFromDraft(
  draft: DraftState,
  ctx: ShareDraftContext,
): ShareRecord {
  const existingId = draft.shareId ?? getActiveShareId();
  const index = readIndex();
  const prev = existingId ? index[existingId] : undefined;
  const id = prev?.id ?? generateShareId();
  const now = new Date().toISOString();
  const durationSec = draft.clips.reduce((s, c) => s + c.durationSec, 0);
  const first = draft.clips[0];
  const record: ShareRecord = {
    id,
    title: draft.title.trim() || "Untitled voyage",
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
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  saveShare(record);
  return record;
}

export function listShares(): ShareRecord[] {
  return Object.values(readIndex()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
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
