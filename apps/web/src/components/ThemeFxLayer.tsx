import { useEffect, useRef } from "react";
import { fxOps, type FxBlend, type ThemeLook } from "@voyajes/core";
import { drawFxOps } from "../lib/themeFx";

const GROUPS: FxBlend[] = ["multiply", "screen", "overlay", "normal"];

/**
 * Live film-look layer (grain, leaks, glow, duotone, scanlines, glitch,
 * particles, letterbox) over a stage. Each blend group is its own canvas
 * with a matching CSS mix-blend-mode so it composites onto the real media.
 */
export function ThemeFxLayer({ look, intensity, getTime, playing = true }: { look: ThemeLook; intensity: number; getTime?: () => number; playing?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const cvs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const timeRef = useRef(getTime);
  timeRef.current = getTime;
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = () => {
      const el = root.current;
      if (!el) return;
      const scale = Math.min(1, 540 / Math.max(1, el.clientWidth));
      const w = Math.max(2, Math.round(el.clientWidth * scale)), h = Math.max(2, Math.round(el.clientHeight * scale));
      const t = reduced ? 1.2 : (timeRef.current?.() ?? (performance.now() - t0) / 1000);
      const ops = fxOps(look, intensity, t, w, h);
      for (const g of GROUPS) {
        const c = cvs.current[g];
        if (!c) continue;
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        const x = c.getContext("2d");
        if (!x) continue;
        x.clearRect(0, 0, w, h);
        drawFxOps(x, ops, w, h, g);
      }
      if (!reduced && playing) raf = requestAnimationFrame(frame);
    };
    frame();
    // when paused keep drawing a few frames so scrubbing updates
    const iv = !playing && !reduced ? window.setInterval(frame, 120) : 0;
    return () => {
      cancelAnimationFrame(raf);
      if (iv) window.clearInterval(iv);
    };
  }, [look, intensity, playing]);
  return (
    <div ref={root} className="vj-fx-layer" aria-hidden data-fx={look.id}>
      {GROUPS.map((g) => (
        <canvas key={g} ref={(el) => (cvs.current[g] = el)} style={{ mixBlendMode: g === "normal" ? "normal" : g }} />
      ))}
    </div>
  );
}
