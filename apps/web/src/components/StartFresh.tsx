import { useEffect, useState } from "react";
import { dismissUndo, FRESH_EVENT, pendingUndo, undoStartFresh, UNDO_MS } from "../lib/startFresh";

/** Confirm sheet: "Clear everything and start over?" */
export function StartFreshSheet({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="vj-fresh-scrim" role="presentation" onClick={onCancel}>
      <div className="vj-fresh-sheet" role="dialog" aria-modal="true" aria-labelledby="vj-fresh-h" onClick={(e) => e.stopPropagation()}>
        <div className="vj-fresh-icon" aria-hidden>🧹</div>
        <h2 id="vj-fresh-h">Clear everything and start over?</h2>
        <p className="muted">Photos, music, text, theme and invitation details are cleared from this device. Links you already shared keep working.</p>
        <div className="vj-fresh-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} data-fresh-cancel>
            Keep editing
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} data-fresh-confirm autoFocus>
            Start fresh
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Started fresh · Undo" toast, ~10s, survives the editor remount. */
export function FreshUndoToast() {
  const [info, setInfo] = useState(() => pendingUndo());
  useEffect(() => {
    const on = () => setInfo(pendingUndo());
    window.addEventListener(FRESH_EVENT, on);
    return () => window.removeEventListener(FRESH_EVENT, on);
  }, []);
  useEffect(() => {
    if (!info) return;
    const t = window.setTimeout(() => {
      dismissUndo();
      setInfo(null);
    }, Math.max(0, UNDO_MS - (Date.now() - info.at)));
    return () => window.clearTimeout(t);
  }, [info]);
  if (!info) return null;
  return (
    <div className="vj-fresh-toast" role="status">
      <span>Started fresh</span>
      <button
        type="button"
        data-fresh-undo
        onClick={() => {
          setInfo(null);
          void undoStartFresh();
        }}
      >
        Undo
      </button>
      <span className="vj-fresh-toast-bar" style={{ animationDuration: `${UNDO_MS}ms` }} />
    </div>
  );
}
