/**
 * Multi-track timeline (video/photo · text · audio) with playhead, scrubbing,
 * zoom, selection, drag-to-reorder, trim handles and transition gap objects.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from "react";
import { clipStarts, type Keyframe } from "@voyajes/core";

export type TLClip = {
  id: string;
  kind: "image" | "video";
  objectUrl: string;
  fileName: string;
  durationSec: number;
  inSec?: number;
  keyframes?: Keyframe[];
};

export type TLText = {
  id: string;
  at: number;
  end: number;
  value: string;
  keyframes?: Keyframe[];
};

export type TLSelection =
  | { type: "clip"; id: string }
  | { type: "gap"; index: number }
  | { type: "text"; id: string }
  | { type: "audio" }
  | null;

type Props = {
  clips: TLClip[];
  texts: TLText[];
  audioLabel: string;
  totalDuration: number;
  playhead: number;
  playing: boolean;
  accent: string;
  compact?: boolean;
  selection: TLSelection;
  gapInfo: (index: number) => { icon: string; label: string; custom: boolean; sec: number };
  onSelect: (sel: TLSelection) => void;
  onSeek: (timeSec: number) => void;
  onTogglePlay: () => void;
  onReorder: (from: number, to: number) => void;
  onTrimClip: (id: string, next: { durationSec: number; inSec?: number }, origin: { durationSec: number; inSec: number }) => void;
  onTextTiming: (id: string, at: number, end: number) => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddKeyframe: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddClips: () => void;
  onAddText: () => void;
};

const BASE_PX = 56;
const MIN_CLIP = 0.3;

function fmt(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
}

type DragState =
  | { kind: "scrub" }
  | { kind: "trim-clip"; id: string; edge: "start" | "end"; x0: number; dur0: number; in0: number }
  | { kind: "move-clip"; index: number; x0: number; dx: number; active: boolean }
  | { kind: "text"; id: string; mode: "move" | "start" | "end"; x0: number; at0: number; end0: number };

export function Timeline(p: Props) {
  const [zoom, setZoom] = useState(1);
  const pxPerSec = BASE_PX * zoom;
  const scrollRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [moveGhost, setMoveGhost] = useState<{ index: number; dx: number } | null>(null);
  const starts = useMemo(() => clipStarts(p.clips), [p.clips]);
  const total = Math.max(p.totalDuration, 1);
  const width = total * pxPerSec + 120;

  // Keep the playhead in view while playing
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !p.playing) return;
    const x = p.playhead * pxPerSec;
    if (x < el.scrollLeft + 20 || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3);
    }
  }, [p.playhead, p.playing, pxPerSec]);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const lane = laneRef.current;
      if (!lane) return 0;
      const r = lane.getBoundingClientRect();
      return Math.max(0, Math.min(p.totalDuration, (clientX - r.left) / pxPerSec));
    },
    [p.totalDuration, pxPerSec],
  );

  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "scrub") {
      p.onSeek(timeFromClientX(e.clientX));
    } else if (d.kind === "trim-clip") {
      const delta = (e.clientX - d.x0) / pxPerSec;
      if (d.edge === "end") {
        p.onTrimClip(d.id, { durationSec: Math.max(MIN_CLIP, d.dur0 + delta) }, { durationSec: d.dur0, inSec: d.in0 });
      } else {
        const clamped = Math.min(d.dur0 - MIN_CLIP, Math.max(-d.in0, delta));
        p.onTrimClip(
          d.id,
          { durationSec: d.dur0 - clamped, inSec: d.in0 + clamped },
          { durationSec: d.dur0, inSec: d.in0 },
        );
      }
    } else if (d.kind === "move-clip") {
      d.dx = e.clientX - d.x0;
      if (!d.active && Math.abs(d.dx) > 8) d.active = true;
      if (d.active) setMoveGhost({ index: d.index, dx: d.dx });
    } else if (d.kind === "text") {
      const delta = (e.clientX - d.x0) / pxPerSec;
      const len = d.end0 - d.at0;
      if (d.mode === "move") {
        const at = Math.max(0, Math.min(Math.max(0, p.totalDuration - 0.2), d.at0 + delta));
        p.onTextTiming(d.id, round(at), round(at + len));
      } else if (d.mode === "start") {
        const at = Math.max(0, Math.min(d.end0 - 0.2, d.at0 + delta));
        p.onTextTiming(d.id, round(at), d.end0);
      } else {
        const end = Math.max(d.at0 + 0.2, d.end0 + delta);
        p.onTextTiming(d.id, d.at0, round(end));
      }
    }
  };

  const endDrag = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (e.type === "pointercancel") {
      setMoveGhost(null);
      return;
    }
    if (d?.kind === "move-clip") {
      setMoveGhost(null);
      if (d.active) {
        const center = (starts[d.index] + p.clips[d.index].durationSec / 2) * pxPerSec + d.dx;
        let to = 0;
        for (let i = 0; i < p.clips.length; i++) {
          const mid = (starts[i] + p.clips[i].durationSec / 2) * pxPerSec;
          if (center > mid) to = i;
        }
        if (center < (starts[0] + p.clips[0].durationSec / 2) * pxPerSec) to = 0;
        if (to !== d.index) p.onReorder(d.index, to);
      } else {
        p.onSelect({ type: "clip", id: p.clips[d.index].id });
        p.onSeek(Math.min(p.totalDuration, Math.max(starts[d.index], timeFromClientX(e.clientX))));
      }
    }
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const capture = (e: RPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const sel = p.selection;
  const selectedClip = sel?.type === "clip" ? sel.id : null;
  const hasSel = Boolean(sel && sel.type !== "audio");

  const ticks = useMemo(() => {
    const step = zoom >= 2 ? 0.5 : zoom >= 0.75 ? 1 : zoom >= 0.4 ? 2 : 5;
    const out: number[] = [];
    for (let t = 0; t <= total + 0.001; t += step) out.push(Math.round(t * 10) / 10);
    return out;
  }, [total, zoom]);

  return (
    <div className={`vj-tl${p.compact ? " is-compact" : ""}`} style={{ ["--tl-accent" as string]: p.accent }}>
      <div className="vj-tl-toolbar" role="toolbar" aria-label="Timeline tools">
        <button type="button" className="vj-tl-btn" onClick={p.onTogglePlay} aria-label={p.playing ? "Pause" : "Play"} title={p.playing ? "Pause (Space)" : "Play (Space)"}>
          {p.playing ? "❚❚" : "▶"}
        </button>
        <span className="vj-tl-time">{fmt(p.playhead)} / {fmt(p.totalDuration)}</span>
        <span className="vj-tl-sep" />
        <button type="button" className="vj-tl-btn" disabled={!p.canUndo} onClick={p.onUndo} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">↶</button>
        <button type="button" className="vj-tl-btn" disabled={!p.canRedo} onClick={p.onRedo} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">↷</button>
        <span className="vj-tl-sep" />
        <button type="button" className="vj-tl-btn" disabled={p.clips.length === 0} onClick={p.onSplit} title="Split at playhead (S)" aria-label="Split at playhead">✂<span className="vj-tl-btn-label">Split</span></button>
        <button type="button" className="vj-tl-btn" disabled={!hasSel || sel?.type === "gap"} onClick={p.onDuplicate} title="Duplicate (Ctrl/Cmd+D)" aria-label="Duplicate">⧉<span className="vj-tl-btn-label">Duplicate</span></button>
        <button type="button" className="vj-tl-btn" disabled={!hasSel} onClick={p.onDelete} title="Delete (Del)" aria-label="Delete">🗑<span className="vj-tl-btn-label">Delete</span></button>
        <button type="button" className="vj-tl-btn" disabled={!(sel?.type === "clip" || sel?.type === "text")} onClick={p.onAddKeyframe} title="Add keyframe at playhead (K)" aria-label="Add keyframe">◆<span className="vj-tl-btn-label">Keyframe</span></button>
        <span className="vj-tl-sep" />
        <button type="button" className="vj-tl-btn" onClick={() => setZoom((z) => Math.max(0.25, z / 1.5))} aria-label="Zoom out" title="Zoom out">－</button>
        <button type="button" className="vj-tl-btn" onClick={() => setZoom((z) => Math.min(6, z * 1.5))} aria-label="Zoom in" title="Zoom in">＋</button>
      </div>

      <div className="vj-tl-body">
        <div className="vj-tl-heads" aria-hidden>
          <div className="vj-tl-head vj-tl-head-ruler" />
          <div className="vj-tl-head" title="Video / photo track">🎞</div>
          <div className="vj-tl-head" title="Text / overlay track">T</div>
          <div className="vj-tl-head" title="Audio track">♪</div>
        </div>
        <div className="vj-tl-scroll" ref={scrollRef}>
          <div
            className="vj-tl-lanes"
            ref={laneRef}
            style={{ width }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* Ruler (scrub) */}
            <div
              className="vj-tl-ruler"
              onPointerDown={(e) => {
                capture(e);
                drag.current = { kind: "scrub" };
                p.onSeek(timeFromClientX(e.clientX));
              }}
            >
              {ticks.map((t) => (
                <span key={t} className="vj-tl-tick" style={{ left: t * pxPerSec }}>
                  {Number.isInteger(t) ? `${t}s` : ""}
                </span>
              ))}
            </div>

            {/* Video / photo track */}
            <div className="vj-tl-track vj-tl-track-video">
              {p.clips.map((c, i) => {
                const left = starts[i] * pxPerSec;
                const w = Math.max(14, c.durationSec * pxPerSec - 2);
                const ghost = moveGhost?.index === i ? moveGhost.dx : 0;
                const selected = selectedClip === c.id;
                return (
                  <div
                    key={c.id}
                    className={`vj-tl-clip${selected ? " selected" : ""}${ghost ? " dragging" : ""}`}
                    style={{
                      left,
                      width: w,
                      transform: ghost ? `translateX(${ghost}px)` : undefined,
                      backgroundImage: c.kind === "image" ? `url(${c.objectUrl})` : undefined,
                    }}
                    title={`${c.fileName} · ${c.durationSec.toFixed(1)}s`}
                    onPointerDown={(e) => {
                      if (e.pointerType === "touch") {
                        // touch: tap selects; reorder via inspector ◀ ▶ (keeps swipe-scroll)
                        drag.current = { kind: "move-clip", index: i, x0: e.clientX, dx: 0, active: false };
                        return;
                      }
                      capture(e);
                      drag.current = { kind: "move-clip", index: i, x0: e.clientX, dx: 0, active: false };
                    }}
                  >
                    {c.kind === "video" && (
                      <video src={c.objectUrl} muted playsInline preload="metadata" className="vj-tl-clip-thumb" />
                    )}
                    <span className="vj-tl-clip-label">
                      {c.kind === "video" ? "▶ " : ""}
                      {c.durationSec.toFixed(1)}s
                    </span>
                    {(c.keyframes ?? []).map((k, ki) => (
                      <span
                        key={ki}
                        className="vj-tl-kf"
                        style={{ left: Math.min(w - 6, k.t * pxPerSec) }}
                        title={`Keyframe @ ${k.t.toFixed(2)}s`}
                      />
                    ))}
                    <span
                      className="vj-tl-handle vj-tl-handle-start"
                      aria-label="Trim start"
                      onPointerDown={(e) => {
                        capture(e);
                        p.onSelect({ type: "clip", id: c.id });
                        drag.current = { kind: "trim-clip", id: c.id, edge: "start", x0: e.clientX, dur0: c.durationSec, in0: c.inSec ?? 0 };
                      }}
                    />
                    <span
                      className="vj-tl-handle vj-tl-handle-end"
                      aria-label="Trim end"
                      onPointerDown={(e) => {
                        capture(e);
                        p.onSelect({ type: "clip", id: c.id });
                        drag.current = { kind: "trim-clip", id: c.id, edge: "end", x0: e.clientX, dur0: c.durationSec, in0: c.inSec ?? 0 };
                      }}
                    />
                  </div>
                );
              })}
              {p.clips.slice(0, -1).map((c, i) => {
                const g = p.gapInfo(i);
                const x = (starts[i] + c.durationSec) * pxPerSec;
                const selected = sel?.type === "gap" && sel.index === i;
                return (
                  <button
                    key={`gap-${c.id}`}
                    type="button"
                    className={`vj-tl-gap${selected ? " selected" : ""}${g.custom ? " custom" : ""}`}
                    style={{ left: x }}
                    title={`Transition: ${g.label} · ${g.sec.toFixed(1)}s`}
                    aria-label={`Transition between clip ${i + 1} and ${i + 2}: ${g.label}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => p.onSelect({ type: "gap", index: i })}
                  >
                    {g.icon}
                  </button>
                );
              })}
              <button
                type="button"
                className="vj-tl-add"
                style={{ left: p.totalDuration * pxPerSec + 6 }}
                onClick={p.onAddClips}
                aria-label="Add clips"
                title="Add clips"
              >
                +
              </button>
            </div>

            {/* Text track */}
            <div className="vj-tl-track vj-tl-track-text">
              {p.texts.map((t) => {
                const selected = sel?.type === "text" && sel.id === t.id;
                const w = Math.max(18, (t.end - t.at) * pxPerSec - 2);
                return (
                  <div
                    key={t.id}
                    className={`vj-tl-text${selected ? " selected" : ""}`}
                    style={{ left: t.at * pxPerSec, width: w }}
                    title={t.value}
                    onPointerDown={(e) => {
                      p.onSelect({ type: "text", id: t.id });
                      if (e.pointerType === "touch") return;
                      capture(e);
                      drag.current = { kind: "text", id: t.id, mode: "move", x0: e.clientX, at0: t.at, end0: t.end };
                    }}
                  >
                    <span className="vj-tl-text-label">{t.value || "Text"}</span>
                    {(t.keyframes ?? []).map((k, ki) => (
                      <span key={ki} className="vj-tl-kf" style={{ left: Math.min(w - 6, k.t * pxPerSec) }} />
                    ))}
                    <span
                      className="vj-tl-handle vj-tl-handle-start"
                      onPointerDown={(e) => {
                        capture(e);
                        p.onSelect({ type: "text", id: t.id });
                        drag.current = { kind: "text", id: t.id, mode: "start", x0: e.clientX, at0: t.at, end0: t.end };
                      }}
                    />
                    <span
                      className="vj-tl-handle vj-tl-handle-end"
                      onPointerDown={(e) => {
                        capture(e);
                        p.onSelect({ type: "text", id: t.id });
                        drag.current = { kind: "text", id: t.id, mode: "end", x0: e.clientX, at0: t.at, end0: t.end };
                      }}
                    />
                  </div>
                );
              })}
              <button
                type="button"
                className="vj-tl-add vj-tl-add-text"
                style={{ left: Math.min(p.playhead, Math.max(0, p.totalDuration)) * pxPerSec + 4 }}
                onClick={p.onAddText}
                aria-label="Add text at playhead"
                title="Add text at playhead"
              >
                ＋T
              </button>
            </div>

            {/* Audio track */}
            <div className="vj-tl-track vj-tl-track-audio">
              <button
                type="button"
                className={`vj-tl-audio${sel?.type === "audio" ? " selected" : ""}`}
                style={{ width: Math.max(40, p.totalDuration * pxPerSec - 2) }}
                onClick={() => p.onSelect({ type: "audio" })}
              >
                ♪ {p.audioLabel}
              </button>
            </div>

            <div className="vj-tl-playhead" style={{ left: p.playhead * pxPerSec }} aria-hidden>
              <span className="vj-tl-playhead-knob" />
            </div>
          </div>
        </div>
      </div>
      {!p.compact && (
        <p className="vj-tl-hint">
          Drag the ruler to scrub · drag clips to reorder · pull clip edges to trim · tap ✦ between clips for transitions
        </p>
      )}
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
