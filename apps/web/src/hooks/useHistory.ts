import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Snapshot-based undo/redo. Every change to `snapshot` (referentially new) is
 * recorded; rapid bursts (drags, typing) within `burstMs` collapse into one step.
 */
export function useHistory<T>(
  snapshot: T,
  apply: (s: T) => void,
  enabled: boolean,
  burstMs = 450,
  limit = 100,
) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef<T | null>(null);
  const applying = useRef(false);
  const burst = useRef<number | null>(null);
  const [, bump] = useState(0);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!enabled) return;
    if (last.current === null || applying.current) {
      last.current = snapshot;
      applying.current = false;
      return;
    }
    if (last.current === snapshot) return;
    if (burst.current === null) {
      past.current.push(last.current);
      if (past.current.length > limit) past.current.shift();
      future.current = [];
      bump((n) => n + 1);
    } else {
      window.clearTimeout(burst.current);
    }
    burst.current = window.setTimeout(() => {
      burst.current = null;
    }, burstMs);
    last.current = snapshot;
  }, [snapshot, enabled, burstMs, limit]);

  const endBurst = () => {
    if (burst.current !== null) {
      window.clearTimeout(burst.current);
      burst.current = null;
    }
  };

  const undo = useCallback(() => {
    endBurst();
    const prev = past.current.pop();
    if (prev === undefined || last.current === null) return false;
    future.current.push(last.current);
    applying.current = true;
    last.current = prev;
    applyRef.current(prev);
    bump((n) => n + 1);
    return true;
  }, []);

  const redo = useCallback(() => {
    endBurst();
    const next = future.current.pop();
    if (next === undefined || last.current === null) return false;
    past.current.push(last.current);
    applying.current = true;
    last.current = next;
    applyRef.current(next);
    bump((n) => n + 1);
    return true;
  }, []);

  /** Current committed snapshot (e.g. before a one-tap template apply). */
  const checkpoint = useCallback(() => {
    endBurst();
    return last.current;
  }, []);

  /** Restore an earlier checkpoint as a new undoable step. */
  const restore = useCallback((s: T) => {
    endBurst();
    if (last.current !== null) past.current.push(last.current);
    future.current = [];
    applying.current = true;
    last.current = s;
    applyRef.current(s);
    bump((n) => n + 1);
  }, []);

  return {
    undo,
    redo,
    checkpoint,
    restore,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
