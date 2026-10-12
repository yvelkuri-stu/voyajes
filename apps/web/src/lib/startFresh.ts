/**
 * v0.8 Start fresh — one implementation for every "start over" entry point
 * (Home, ⋯ menu, template gallery "Start from scratch", ?fresh=1 links).
 *
 * It wipes storage FIRST (draft JSON, CLI project JSON, every media blob in
 * IndexedDB, last export, Pro toggle), writes a clean draft with a new
 * project id, bumps the write epoch so in-flight writes from the old editor
 * are dropped, then asks the Create route to remount — so no React state,
 * undo history, analysis cache or object URL can leak into the new project.
 * Published voyages on the server are untouched (we only forget the local
 * link between this draft and its share).
 *
 * An in-memory snapshot powers the ~10s Undo toast.
 */
import {
  bumpDraftEpoch,
  clearAllBlobs,
  clearDraft,
  defaultDraft,
  getAllBlobs,
  loadDraft,
  putBlob,
  saveDraft,
  type DraftState,
} from "./draftStore";
import { clearLastExport } from "./lastExportStore";
import { loadPrefs, updatePrefs } from "./prefsStore";

export const SS_START_FRESH = "voyajes.startFresh";
export const SS_FRESH_NONCE = "voyajes.freshNonce";
export const FRESH_EVENT = "voyajes:fresh";
export const DEFAULT_THEME_ID = "theme.ocean-pop";
export const UNDO_MS = 10_000;

export type FreshMode = "voyage" | "invitation";

type Snapshot = { draft: DraftState; blobs: [string, Blob][]; pro: boolean; at: number };
let undoSnap: Snapshot | null = null;

function bumpNonce(): void {
  try {
    sessionStorage.setItem(SS_FRESH_NONCE, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(FRESH_EVENT));
}

function isEmpty(d: DraftState | null): boolean {
  return (
    !d ||
    (d.clips.length === 0 &&
      (d.textOverlays ?? []).length === 0 &&
      (d.audioClips ?? []).length === 0 &&
      (d.customSounds ?? []).length === 0 &&
      !d.templateId)
  );
}

export function freshDraft(mode: FreshMode): DraftState {
  const d = defaultDraft(DEFAULT_THEME_ID);
  return { ...d, mode, title: mode === "invitation" ? "You're invited!" : d.title };
}

/** Clear everything and start over. Resolves once storage is clean. */
export async function startFresh(mode: FreshMode, opts: { remount?: boolean } = {}): Promise<void> {
  bumpDraftEpoch();
  const prev = loadDraft();
  if (!isEmpty(prev) && prev) {
    let blobs: [string, Blob][] = [];
    try {
      blobs = await getAllBlobs();
    } catch {
      /* ignore */
    }
    undoSnap = { draft: prev, blobs, pro: loadPrefs().pro, at: Date.now() };
  }
  try {
    await clearAllBlobs();
  } catch {
    /* ignore */
  }
  clearDraft();
  clearLastExport();
  if (loadPrefs().pro) updatePrefs({ pro: false });
  bumpDraftEpoch();
  saveDraft(freshDraft(mode));
  try {
    sessionStorage.removeItem(SS_START_FRESH);
  } catch {
    /* ignore */
  }
  if (opts.remount !== false) bumpNonce();
}

/** Undo is offered for UNDO_MS after a start-fresh that discarded something. */
export function pendingUndo(): { at: number; title: string } | null {
  if (!undoSnap || Date.now() - undoSnap.at > UNDO_MS) return null;
  return { at: undoSnap.at, title: undoSnap.draft.title };
}

export function dismissUndo(): void {
  undoSnap = null;
}

export async function undoStartFresh(): Promise<boolean> {
  const snap = undoSnap;
  if (!snap) return false;
  undoSnap = null;
  bumpDraftEpoch();
  await clearAllBlobs().catch(() => {});
  for (const [k, b] of snap.blobs) await putBlob(k, b);
  saveDraft(snap.draft);
  if (snap.pro) updatePrefs({ pro: true });
  bumpNonce();
  return true;
}

/** Legacy synchronous marker (old links); Create runs startFresh on mount. */
export function markStartFresh(mode: FreshMode): void {
  try {
    sessionStorage.setItem(SS_START_FRESH, mode);
  } catch {
    /* private mode / quota */
  }
}

export function peekStartFresh(): FreshMode | null {
  try {
    const v = sessionStorage.getItem(SS_START_FRESH);
    if (v === "voyage" || v === "invitation") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function consumeStartFresh(): FreshMode | null {
  const mode = peekStartFresh();
  try {
    sessionStorage.removeItem(SS_START_FRESH);
  } catch {
    /* ignore */
  }
  return mode;
}

export function readFreshNonce(): string | null {
  try {
    return sessionStorage.getItem(SS_FRESH_NONCE);
  } catch {
    return null;
  }
}

/** Stable React key so Create fully remounts when a new fresh nonce is set. */
export function createRouteKey(): string {
  const nonce = readFreshNonce();
  return nonce ? `create-${nonce}` : "create";
}
