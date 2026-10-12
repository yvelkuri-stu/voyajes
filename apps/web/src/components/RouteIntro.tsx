import { useEffect, useRef } from "react";
import "../styles/storybrain.css";
import { ROUTE_SEC, drawRouteMap } from "../lib/routeMap";
import type { Route } from "../lib/storyBrain";

/** Live route-map intro overlay, driven by the player's timeline clock (matches export). */
export function RouteIntro({ route, getTime, accent, className = "", loop = false }: { route: Route; getTime?: () => number; accent?: string; className?: string; loop?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, w, h);
      let t = getTime ? getTime() : (performance.now() - t0) / 1000;
      // previews loop: replay the draw, then hold the finished map (never blank)
      if (loop) t = Math.min(t % (ROUTE_SEC + 1.5), ROUTE_SEC - 0.85);
      if (t >= 0 && t < ROUTE_SEC) drawRouteMap(ctx, w, h, route, t, accent);
      c.dataset.t = t.toFixed(2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route, getTime, accent, loop]);
  return <canvas ref={ref} className={`route-intro ${className}`} data-route-intro aria-label={`Route map: ${route.km} km`} />;
}
