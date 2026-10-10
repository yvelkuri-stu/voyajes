/**
 * Multi-track timeline (video/photo · text · audio) — playhead, scrubbing, zoom,
 * selection, drag-to-reorder (mouse + long-press on touch), trim handles,
 * transition gap objects, overlapping layout, audio clips with fades + waveform,
 * and magnet snapping with a visual guide.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from "react";
import type { Keyframe } from "@voyajes/core";
import { waveformPeaks } from "../../lib/timelineAudio";

export type TLClip = {
  id: string;
  kind: "image" | "video";
  objectUrl: string;
  fileName: string;
  durationSec: number;
  inSec?: number;
  speed?: number;
  reverse?: boolean;
  mute?: boolean;
  placeholder?: boolean;
  keyframes?: Keyframe[];
};

export type TLText = {
  id: string;
  at: number;
  end: number;
  value: string;
  keyframes?: Keyframe[];
};

export type TLAudio = {
  id: string;
  at: number;
  durationSec: number;
  inSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  volume?: number;
  loop?: boolean;
  label: string;
  url?: string;
};

export type TLSelection =
  | { type: "clip"; id: string }
  | { type: "gap"; index: number }
  | { type: "text"; id: string }
  | { type: "audio"; id?: string }
  | null;

type Props = {
  clips: TLClip[];
  starts: number[];
  texts: TLText[];
  audio: TLAudio[];
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
  onAudioChange: (id: string, patch: Partial<TLAudio>) => void;
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
  onAddAudio: () => void;
};

const BASE_PX = 56;
const MIN_CLIP = 0.3;
const SNAP_PX = 9;
const LONG_PRESS_MS = 380;

function fmt(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
}
function round(n: number) {
  return Math.round(n * 100) / 100;
}

type DragState =
  | { kind: "scrub" }
  | { kind: "trim-clip"; id: string; index: number; edge: "start" | "end"; x0: number; dur0: number; in0: number; speed: number }
  | { kind: "move-clip"; index: number; x0: number; dx: number; active: boolean; touch?: boolean }
  | { kind: "text"; id: string; mode: "move" | "start" | "end"; x0: number; at0: number; end0: number }
  | { kind: "audio"; id: string; mode: "move" | "start" | "end" | "fade-in" | "fade-out"; x0: number; a: TLAudio };

export function Timeline(p: Props) {
  const [zoom, setZoom] = useState(1);
  const [magnet, setMagnet] = useState(true);
  const [guide, setGuide] = useState<number | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const pxPerSec = BASE_PX * zoom;
  const scrollRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const press = useRef<{ timer: number; x: number; y: number; start: () => void } | null>(null);
  const [moveGhost, setMoveGhost] = useState<{ index: number; dx: number } | null>(null);
  const total = Math.max(p.totalDuration, 1);
  const audioEnd = p.audio.reduce((m, a) => Math.max(m, a.at + a.durationSec), 0);
  const width = Math.max(total, audioEnd) * pxPerSec + 140;

  // Edge swipes: when the timeline is already scrolled to an end, a further
  // horizontal swipe would chain to the browser (back/forward nav). Swallow it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let sx = 0, sy = 0, axis: "x" | "y" | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; axis = null;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (!axis && Math.abs(dx) + Math.abs(dy) > 6) axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis !== "x" || !e.cancelable) return;
      const atStart = el.scrollLeft <= 0 && dx > 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && dx < 0;
      if (atStart || atEnd) e.preventDefault();
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
    };
  }, []);

  // Prevent page scroll while a touch drag is lifted (long-press)
  useEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (drag.current && drag.current.kind !== "scrub" && lifted) e.preventDefault();
      if (press.current) {
        const t = e.touches[0];
        if (t && Math.hypot(t.clientX - press.current.x, t.clientY - press.current.y) > 10) {
          window.clearTimeout(press.current.timer);
          press.current = null;
        }
      }
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, [lifted]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !p.playing) return;
    const x = p.playhead * pxPerSec;
    if (x < el.scrollLeft + 20 || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3);
    }
  }, [p.playhead, p.playing, pxPerSec]);

  /** Snap candidates (timeline seconds) excluding the item being dragged. */
  const snapPoints = useCallback(
    (excludeId?: string) => {
      const pts: number[] = [0, p.playhead, p.totalDuration];
      p.clips.forEach((c, i) => {
        if (c.id === excludeId) return;
        const s = p.starts[i] ?? 0;
        pts.push(s, s + c.durationSec);
        for (const k of c.keyframes ?? []) pts.push(s + k.t);
      });
      for (const t of p.texts) {
        if (t.id === excludeId) continue;
        pts.push(t.at, t.end);
        for (const k of t.keyframes ?? []) pts.push(t.at + k.t);
      }
      for (const a of p.audio) {
        if (a.id === excludeId) continue;
        pts.push(a.at, a.at + a.durationSec);
      }
      return pts;
    },
    [p.clips, p.starts, p.texts, p.audio, p.playhead, p.totalDuration],
  );

  /** Snap one or more candidate edge times; returns the delta to apply. */
  const snapDelta = (times: number[], excludeId?: string): number => {
    if (!magnet) {
      setGuide(null);
      return 0;
    }
    const pts = snapPoints(excludeId);
    let best: { d: number; at: number } | null = null;
    for (const t of times) {
      for (const q of pts) {
        const d = q - t;
        if (Math.abs(d) * pxPerSec <= SNAP_PX && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: q };
      }
    }
    setGuide(best ? best.at : null);
    return best ? best.d : 0;
  };

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
      let t = timeFromClientX(e.clientX);
      if (magnet) {
        const pts = snapPoints().filter((q) => q !== p.playhead);
        const near = pts.find((q) => Math.abs(q - t) * pxPerSec <= SNAP_PX);
        if (near !== undefined) {
          t = near;
          setGuide(near);
        } else setGuide(null);
      }
      p.onSeek(t);
    } else if (d.kind === "trim-clip") {
      let delta = (e.clientX - d.x0) / pxPerSec;
      const s = p.starts[d.index] ?? 0;
      if (d.edge === "end") {
        delta += snapDelta([s + d.dur0 + delta], d.id);
        p.onTrimClip(d.id, { durationSec: Math.max(MIN_CLIP, d.dur0 + delta) }, { durationSec: d.dur0, inSec: d.in0 });
      } else {
        const clamped = Math.min(d.dur0 - MIN_CLIP, Math.max(-d.in0 / d.speed, delta));
        p.onTrimClip(
          d.id,
          { durationSec: d.dur0 - clamped, inSec: d.in0 + clamped * d.speed },
          { durationSec: d.dur0, inSec: d.in0 },
        );
      }
    } else if (d.kind === "move-clip") {
      d.dx = e.clientX - d.x0;
      if (!d.active && !d.touch && Math.abs(d.dx) > 8) d.active = true;
      if (d.active) setMoveGhost({ index: d.index, dx: d.dx });
    } else if (d.kind === "text") {
      let delta = (e.clientX - d.x0) / pxPerSec;
      const len = d.end0 - d.at0;
      if (d.mode === "move") {
        delta += snapDelta([d.at0 + delta, d.end0 + delta], d.id);
        const at = Math.max(0, Math.min(Math.max(0, p.totalDuration - 0.2), d.at0 + delta));
        p.onTextTiming(d.id, round(at), round(at + len));
      } else if (d.mode === "start") {
        delta += snapDelta([d.at0 + delta], d.id);
        const at = Math.max(0, Math.min(d.end0 - 0.2, d.at0 + delta));
        p.onTextTiming(d.id, round(at), d.end0);
      } else {
        delta += snapDelta([d.end0 + delta], d.id);
        const end = Math.max(d.at0 + 0.2, d.end0 + delta);
        p.onTextTiming(d.id, d.at0, round(end));
      }
    } else if (d.kind === "audio") {
      let delta = (e.clientX - d.x0) / pxPerSec;
      const a = d.a;
      const end0 = a.at + a.durationSec;
      if (d.mode === "move") {
        delta += snapDelta([a.at + delta, end0 + delta], a.id);
        p.onAudioChange(a.id, { at: round(Math.max(0, a.at + delta)) });
      } else if (d.mode === "start") {
        delta += snapDelta([a.at + delta], a.id);
        const cl = Math.min(a.durationSec - MIN_CLIP, Math.max(-Math.min(a.at, a.inSec ?? 0), delta));
        p.onAudioChange(a.id, {
          at: round(a.at + cl),
          durationSec: round(a.durationSec - cl),
          inSec: round(Math.max(0, (a.inSec ?? 0) + cl)),
        });
      } else if (d.mode === "end") {
        delta += snapDelta([end0 + delta], a.id);
        p.onAudioChange(a.id, { durationSec: round(Math.max(MIN_CLIP, a.durationSec + delta)) });
      } else if (d.mode === "fade-in") {
        p.onAudioChange(a.id, { fadeInSec: round(Math.max(0, Math.min(a.durationSec / 2, (a.fadeInSec ?? 0) + delta))) });
      } else {
        p.onAudioChange(a.id, { fadeOutSec: round(Math.max(0, Math.min(a.durationSec / 2, (a.fadeOutSec ?? 0) - delta))) });
      }
    }
  };

  const endDrag = (e: RPointerEvent) => {
    if (press.current) {
      window.clearTimeout(press.current.timer);
      press.current = null;
    }
    const d = drag.current;
    drag.current = null;
    setGuide(null);
    setLifted(null);
    if (e.type === "pointercancel") {
      setMoveGhost(null);
      return;
    }
    if (d?.kind === "move-clip") {
      setMoveGhost(null);
      if (d.active) {
        const mids = p.clips.map((c, i) => ((p.starts[i] ?? 0) + c.durationSec / 2) * pxPerSec);
        const center = mids[d.index] + d.dx;
        let to = 0;
        for (let i = 0; i < mids.length; i++) if (center > mids[i]) to = i;
        if (center < mids[0]) to = 0;
        if (to !== d.index) p.onReorder(d.index, to);
      } else {
        p.onSelect({ type: "clip", id: p.clips[d.index].id });
        p.onSeek(Math.min(p.totalDuration, Math.max(p.starts[d.index] ?? 0, timeFromClientX(e.clientX))));
      }
    }
  };

  const capture = (e: RPointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  /** Mouse: drag immediately. Touch: long-press to lift (keeps swipe-to-scroll). */
  const beginBodyDrag = (e: RPointerEvent, id: string, start: () => void) => {
    e.stopPropagation();
    if (e.pointerType !== "touch") {
      capture(e);
      start();
      return;
    }
    const target = e.currentTarget as Element;
    const pid = e.pointerId;
    const run = () => {
      press.current = null;
      try {
        target.setPointerCapture?.(pid);
      } catch {
        /* ignore */
      }
      start();
      if (drag.current?.kind === "move-clip") drag.current.active = true;
      setLifted(id);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* ignore */
      }
    };
    press.current = { timer: window.setTimeout(run, LONG_PRESS_MS), x: e.clientX, y: e.clientY, start: run };
  };

  const sel = p.selection;
  const selectedClip = sel?.type === "clip" ? sel.id : null;
  const hasSel = Boolean(sel && (sel.type !== "audio" || sel.id));

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
        <button type="button" className="vj-tl-btn" disabled={p.clips.length === 0 && p.audio.length === 0} onClick={p.onSplit} title="Split at playhead (S)" aria-label="Split at playhead">✂<span className="vj-tl-btn-label">Split</span></button>
        <button type="button" className="vj-tl-btn" disabled={!hasSel || sel?.type === "gap"} onClick={p.onDuplicate} title="Duplicate (Ctrl/Cmd+D)" aria-label="Duplicate">⧉<span className="vj-tl-btn-label">Duplicate</span></button>
        <button type="button" className="vj-tl-btn" disabled={!hasSel} onClick={p.onDelete} title="Delete (Del)" aria-label="Delete">🗑<span className="vj-tl-btn-label">Delete</span></button>
        <button type="button" className="vj-tl-btn" disabled={!(sel?.type === "clip" || sel?.type === "text")} onClick={p.onAddKeyframe} title="Add keyframe at playhead (K)" aria-label="Add keyframe">◆<span className="vj-tl-btn-label">Keyframe</span></button>
        <span className="vj-tl-sep" />
        <button
          type="button"
          className={`vj-tl-btn${magnet ? " is-on" : ""}`}
          onClick={() => setMagnet((m) => !m)}
          aria-pressed={magnet}
          aria-label="Snapping"
          title={`Snapping ${magnet ? "on" : "off"}`}
          data-magnet-toggle
        >
          🧲<span className="vj-tl-btn-label">Snap</span>
        </button>
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

            {/* Video / photo track (overlapping layout) */}
            <div className="vj-tl-track vj-tl-track-video">
              {p.clips.map((c, i) => {
                const left = (p.starts[i] ?? 0) * pxPerSec;
                const w = Math.max(14, c.durationSec * pxPerSec - 2);
                const ghost = moveGhost?.index === i ? moveGhost.dx : 0;
                const selected = selectedClip === c.id;
                const speed = c.speed ?? 1;
                return (
                  <div
                    key={c.id}
                    className={`vj-tl-clip${selected ? " selected" : ""}${ghost ? " dragging" : ""}${lifted === c.id ? " lifted" : ""}`}
                    style={{
                      left,
                      width: w,
                      zIndex: selected ? 2 : 1,
                      transform: ghost ? `translateX(${ghost}px)` : undefined,
                      backgroundImage: c.kind === "image" ? `url(${c.objectUrl})` : undefined,
                    }}
                    title={`${c.fileName} · ${c.durationSec.toFixed(1)}s${speed !== 1 ? ` · ${speed}×` : ""}`}
                    onPointerDown={(e) => {
                      const st = () => {
                        drag.current = { kind: "move-clip", index: i, x0: e.clientX, dx: 0, active: false };
                      };
                      if (e.pointerType === "touch") {
                        // tap (no long-press) still selects via pointerup
                        drag.current = { kind: "move-clip", index: i, x0: e.clientX, dx: 0, active: false, touch: true };
                      }
                      beginBodyDrag(e, c.id, st);
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {c.kind === "video" && (
                      <video src={c.objectUrl} muted playsInline preload="metadata" className="vj-tl-clip-thumb" />
                    )}
                    <span className="vj-tl-clip-label">
                      {c.kind === "video" ? (c.mute === false ? "🔊 " : "▶ ") : ""}
                      {c.durationSec.toFixed(1)}s{speed !== 1 ? ` · ${speed}×` : ""}
                      {c.reverse ? " · ⟲" : ""}
                    </span>
                    {c.placeholder && <span className="vj-placeholder-badge">sample</span>}
                    {(c.keyframes ?? []).map((k, ki) => (
                      <span key={ki} className="vj-tl-kf" style={{ left: Math.min(w - 6, k.t * pxPerSec) }} title={`Keyframe @ ${k.t.toFixed(2)}s`} />
                    ))}
                    <span
                      className="vj-tl-handle vj-tl-handle-start"
                      aria-label="Trim start"
                      onPointerDown={(e) => {
                        capture(e);
                        p.onSelect({ type: "clip", id: c.id });
                        drag.current = { kind: "trim-clip", id: c.id, index: i, edge: "start", x0: e.clientX, dur0: c.durationSec, in0: c.inSec ?? 0, speed };
                      }}
                    />
                    <span
                      className="vj-tl-handle vj-tl-handle-end"
                      aria-label="Trim end"
                      onPointerDown={(e) => {
                        capture(e);
                        p.onSelect({ type: "clip", id: c.id });
                        drag.current = { kind: "trim-clip", id: c.id, index: i, edge: "end", x0: e.clientX, dur0: c.durationSec, in0: c.inSec ?? 0, speed };
                      }}
                    />
                  </div>
                );
              })}
              {p.clips.slice(0, -1).map((c, i) => {
                const g = p.gapInfo(i);
                const x = (p.starts[i + 1] ?? 0) * pxPerSec + (g.sec * pxPerSec) / 2;
                const selected = sel?.type === "gap" && sel.index === i;
                return (
                  <button
                    key={`gap-${c.id}`}
                    type="button"
                    className={`vj-tl-gap${selected ? " selected" : ""}${g.custom ? " custom" : ""}`}
                    style={{ left: x }}
                    title={`Transition: ${g.label} · ${g.sec.toFixed(1)}s overlap`}
                    aria-label={`Transition between clip ${i + 1} and ${i + 2}: ${g.label}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => p.onSelect({ type: "gap", index: i })}
                  >
                    <span>{g.icon}</span>
                  </button>
                );
              })}
              {p.clips.slice(0, -1).map((c, i) => {
                const g = p.gapInfo(i);
                if (g.sec <= 0) return null;
                return (
                  <span
                    key={`ov-${c.id}`}
                    className="vj-tl-overlap"
                    style={{ left: (p.starts[i + 1] ?? 0) * pxPerSec, width: g.sec * pxPerSec }}
                    aria-hidden
                  />
                );
              })}
              <button type="button" className="vj-tl-add" style={{ left: p.totalDuration * pxPerSec + 6 }} onClick={p.onAddClips} aria-label="Add clips" title="Add clips">
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
                    className={`vj-tl-text${selected ? " selected" : ""}${lifted === t.id ? " lifted" : ""}`}
                    style={{ left: t.at * pxPerSec, width: w }}
                    title={t.value}
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      p.onSelect({ type: "text", id: t.id });
                      beginBodyDrag(e, t.id, () => {
                        drag.current = { kind: "text", id: t.id, mode: "move", x0: e.clientX, at0: t.at, end0: t.end };
                      });
                    }}
                  >
                    <span className="vj-tl-text-label">{t.value || "Text"}</span>
                    {(t.keyframes ?? []).map((k, ki) => (
                      <span key={ki} className="vj-tl-kf" style={{ left: Math.min(w - 6, k.t * pxPerSec) }} />
                    ))}
                    {(["start", "end"] as const).map((edge) => (
                      <span
                        key={edge}
                        className={`vj-tl-handle vj-tl-handle-${edge}`}
                        onPointerDown={(e) => {
                          capture(e);
                          p.onSelect({ type: "text", id: t.id });
                          drag.current = { kind: "text", id: t.id, mode: edge, x0: e.clientX, at0: t.at, end0: t.end };
                        }}
                      />
                    ))}
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
              {p.audio.map((a) => {
                const selected = sel?.type === "audio" && sel.id === a.id;
                const w = Math.max(24, a.durationSec * pxPerSec - 2);
                const fi = (a.fadeInSec ?? 0) * pxPerSec;
                const fo = (a.fadeOutSec ?? 0) * pxPerSec;
                return (
                  <div
                    key={a.id}
                    className={`vj-tl-audio${selected ? " selected" : ""}${lifted === a.id ? " lifted" : ""}`}
                    style={{ left: a.at * pxPerSec, width: w }}
                    title={`${a.label} · ${a.durationSec.toFixed(1)}s · vol ${Math.round((a.volume ?? 1) * 100)}%`}
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      p.onSelect({ type: "audio", id: a.id });
                      beginBodyDrag(e, a.id, () => {
                        drag.current = { kind: "audio", id: a.id, mode: "move", x0: e.clientX, a };
                      });
                    }}
                  >
                    <AudioWave url={a.url} width={w} inSec={a.inSec ?? 0} durationSec={a.durationSec} loop={a.loop !== false} volume={a.volume ?? 1} />
                    <svg className="vj-tl-fades" width={w} height="100%" viewBox={`0 0 ${w} 30`} preserveAspectRatio="none" aria-hidden>
                      <polygon points={`0,30 ${fi},${30 - 26 * Math.min(1, a.volume ?? 1)} ${w - fo},${30 - 26 * Math.min(1, a.volume ?? 1)} ${w},30 ${w},0 0,0`} className="vj-tl-fade-mask" />
                    </svg>
                    <span className="vj-tl-audio-label">♪ {a.label}</span>
                    <span
                      className="vj-tl-fade-handle"
                      style={{ left: Math.max(2, fi - 6) }}
                      title="Drag: fade in"
                      onPointerDown={(e) => {
                        capture(e);
                        p.onSelect({ type: "audio", id: a.id });
                        drag.current = { kind: "audio", id: a.id, mode: "fade-in", x0: e.clientX, a };
                      }}
                    />
                    <span
                      className="vj-tl-fade-handle"
                      style={{ left: Math.min(w - 14, w - fo - 6) }}
                      title="Drag: fade out"
                      onPointerDown={(e) => {
                        capture(e);
                        p.onSelect({ type: "audio", id: a.id });
                        drag.current = { kind: "audio", id: a.id, mode: "fade-out", x0: e.clientX, a };
                      }}
                    />
                    {(["start", "end"] as const).map((edge) => (
                      <span
                        key={edge}
                        className={`vj-tl-handle vj-tl-handle-${edge}`}
                        onPointerDown={(e) => {
                          capture(e);
                          p.onSelect({ type: "audio", id: a.id });
                          drag.current = { kind: "audio", id: a.id, mode: edge, x0: e.clientX, a };
                        }}
                      />
                    ))}
                  </div>
                );
              })}
              <button
                type="button"
                className="vj-tl-add vj-tl-add-text"
                style={{ left: Math.max(audioEnd, p.playhead) * pxPerSec + 4 }}
                onClick={p.onAddAudio}
                aria-label="Add audio at playhead"
                title="Add audio clip at playhead"
              >
                ＋♪
              </button>
            </div>

            {guide !== null && <div className="vj-tl-guide" style={{ left: guide * pxPerSec }} aria-hidden />}
            <div className="vj-tl-playhead" style={{ left: p.playhead * pxPerSec }} aria-hidden>
              <span className="vj-tl-playhead-knob" />
            </div>
          </div>
        </div>
      </div>
      {!p.compact && (
        <p className="vj-tl-hint">
          Scrub the ruler · drag clips (long-press on phones) · pull edges to trim · ✦ = transition overlap · ◗ dots on audio = fades · 🧲 snaps
        </p>
      )}
    </div>
  );
}

/** Waveform bars for an audio clip (handles in-point + looping sources). */
function AudioWave(props: { url?: string; width: number; inSec: number; durationSec: number; loop: boolean; volume: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<{ peaks: Float32Array; duration: number } | null>(null);
  useEffect(() => {
    let alive = true;
    if (!props.url) return;
    waveformPeaks(props.url)
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [props.url]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = Math.max(1, Math.round(props.width));
    const h = 30;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const g = cv.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.55)";
    const bars = Math.max(1, Math.floor(w / 3));
    for (let i = 0; i < bars; i++) {
      const tl = (i / bars) * props.durationSec;
      let v = 0.25 + 0.2 * Math.abs(Math.sin(i * 1.7));
      if (data && data.duration > 0) {
        let src = props.inSec + tl;
        if (props.loop) src %= data.duration;
        v = src < data.duration ? data.peaks[Math.min(data.peaks.length - 1, Math.floor((src / data.duration) * data.peaks.length))] : 0;
      }
      const bh = Math.max(1, v * (h - 6) * Math.min(1.2, props.volume));
      g.fillRect(i * 3, (h - bh) / 2, 2, bh);
    }
  }, [data, props.width, props.inSec, props.durationSec, props.loop, props.volume]);
  return <canvas ref={ref} className="vj-tl-wave" style={{ width: props.width, height: "100%" }} aria-hidden />;
}
