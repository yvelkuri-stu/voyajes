/**
 * Applies clip/text animation presets + keyframes to its children in real time
 * (rAF while playing, static pose while paused/scrubbing). No React re-renders per frame.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { layerTransformAt, transformCss, type ClipAnimation, type Keyframe } from "@voyajes/core";

type Props = {
  animation?: ClipAnimation;
  keyframes?: Keyframe[];
  durationSec: number;
  /** clip-local time to show / start from */
  localSec: number;
  playing: boolean;
  /** change to restart the clock (e.g. clip id) */
  resetKey?: string | number;
  className?: string;
  style?: CSSProperties;
  /** play motion backwards (photos-as-motion reverse) */
  reverse?: boolean;
  /** extra CSS filter (color grade) */
  filter?: string;
  children: ReactNode;
};

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function AnimatedLayer(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const localRef = useRef(p.localSec);
  localRef.current = p.localSec;

  const paint = (t: number) => {
    const el = ref.current;
    if (!el) return;
    const mt = p.reverse ? Math.max(0, p.durationSec - t) : t;
    const tr = layerTransformAt(p.animation, p.keyframes, mt, p.durationSec);
    el.style.transform = transformCss(tr);
    el.style.opacity = String(Math.max(0, Math.min(1, tr.opacity)));
    const parts: string[] = [];
    if (p.filter && p.filter !== "none") parts.push(p.filter);
    if (tr.blur > 0.05) parts.push(`blur(${tr.blur.toFixed(1)}px)`);
    el.style.filter = parts.length ? parts.join(" ") : "";
  };

  useEffect(() => {
    if (!p.playing || reduced()) {
      paint(localRef.current);
      return;
    }
    const t0 = performance.now() - localRef.current * 1000;
    let raf = 0;
    const loop = () => {
      paint(Math.min(p.durationSec, (performance.now() - t0) / 1000));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.playing, p.resetKey, p.animation, p.keyframes, p.durationSec, p.filter, p.reverse]);

  // While paused, follow scrubbing
  useEffect(() => {
    if (!p.playing) paint(p.localSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.localSec, p.playing, p.reverse, p.animation, p.keyframes]);

  return (
    <div ref={ref} className={`vj-anim-layer ${p.className ?? ""}`} style={p.style}>
      {p.children}
    </div>
  );
}
