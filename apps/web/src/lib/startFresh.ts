/**
 * Start-fresh coordination between Home/Share CTAs and Create.
 * sessionStorage is set synchronously on click (before navigation) so Create
 * can wipe even when the query string is lost or the route does not remount.
 */
import { clearAllBlobs, clearDraft } from "./draftStore";

export const SS_START_FRESH = "voyajes.startFresh";
export const SS_FRESH_NONCE = "voyajes.freshNonce";

export type FreshMode = "voyage" | "invitation";

/** Call synchronously from New story / New invitation click handlers. */
export function markStartFresh(mode: FreshMode): void {
  try {
    sessionStorage.setItem(SS_START_FRESH, mode);
    sessionStorage.setItem(SS_FRESH_NONCE, String(Date.now()));
  } catch {
    /* private mode / quota */
  }
  clearDraft();
  void clearAllBlobs().catch(() => {});
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

/** Read and clear the start-fresh mode flag. */
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
