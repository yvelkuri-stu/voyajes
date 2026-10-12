/**
 * v1.1 route-map intro: a stylised, animated map drawn from photo GPS — no map tiles, no API.
 * Used by the live player (canvas overlay) and both export paths.
 */
import type { Route } from "./storyBrain";

export const ROUTE_SEC = 3.2;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** Overlay alpha for timeline time t (holds, then dissolves into the first photo). */
export const routeAlpha = (t: number) => (t < ROUTE_SEC - 0.8 ? 1 : Math.max(0, (ROUTE_SEC - t) / 0.8));

export function drawRouteMap(ctx: CanvasRenderingContext2D, w: number, h: number, route: Route, t: number, accent = "#ff4d8d", accent2 = "#00d1ff") {
  const a = routeAlpha(t);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#0b1026");
  bg.addColorStop(1, "#1a0b2e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // drifting graticule
  const s = Math.min(w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = Math.max(1, s / 540);
  const step = s / 9, drift = (t * step * 0.15) % step;
  for (let x = -step + drift; x < w + step; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = -step + drift; y < h + step; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  // project points into a padded box (equirectangular, lon scaled by cos(lat))
  const pts = route.points;
  const midLat = pts.reduce((n, p) => n + p.lat, 0) / pts.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p.lon * k), ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = s * 0.16;
  const bw = w - pad * 2, bh = h * 0.62 - pad;
  const sc = Math.min(bw / Math.max(1e-6, maxX - minX), bh / Math.max(1e-6, maxY - minY));
  const ox = pad + (bw - (maxX - minX) * sc) / 2, oy = h * 0.14 + (bh - (maxY - minY) * sc) / 2;
  const P = pts.map((_, i) => ({ x: ox + (xs[i] - minX) * sc, y: oy + (ys[i] - minY) * sc }));
  // animated path
  const prog = ease(t / (ROUTE_SEC * 0.7));
  const segs = P.length - 1;
  const upto = prog * segs;
  const grad = ctx.createLinearGradient(P[0].x, P[0].y, P[P.length - 1].x, P[P.length - 1].y);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, accent2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = s / 90;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = accent;
  ctx.shadowBlur = s / 30;
  ctx.setLineDash([s / 40, s / 60]);
  ctx.lineDashOffset = -t * s * 0.1;
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i <= Math.ceil(upto) && i < P.length; i++) {
    const f = Math.min(1, upto - (i - 1));
    // gentle arc between stops
    const ax = P[i - 1].x, ay = P[i - 1].y, bx = P[i].x, by = P[i].y;
    const cx = (ax + bx) / 2 - (by - ay) * 0.18, cy = (ay + by) / 2 + (bx - ax) * 0.18;
    if (f >= 1) ctx.quadraticCurveTo(cx, cy, bx, by);
    else {
      const qx = ax + (cx - ax) * f, qy = ay + (cy - ay) * f;
      const rx = cx + (bx - cx) * f, ry = cy + (by - cy) * f;
      ctx.quadraticCurveTo(qx, qy, qx + (rx - qx) * f, qy + (ry - qy) * f);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  // pins pop in as the line reaches them
  const font = (sz: number, wt = 700) => `${wt} ${sz}px Sora, Inter, system-ui, sans-serif`;
  P.forEach((p, i) => {
    const appear = ease((upto - i + 0.6) * 2.5);
    if (appear <= 0) return;
    const r = (s / 55) * (0.6 + 0.4 * appear) * (1 + 0.15 * Math.sin(t * 6 + i));
    ctx.fillStyle = i === 0 ? accent : i === P.length - 1 ? accent2 : "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = s / 300;
    ctx.stroke();
    const label = pts[i].label;
    if (label && (i === 0 || i === P.length - 1 || P.length <= 6)) {
      ctx.globalAlpha = a * appear;
      ctx.fillStyle = "#fff";
      ctx.font = font(s / 34, 600);
      ctx.textAlign = "center";
      ctx.fillText(label, p.x, p.y - r - s / 50);
      ctx.globalAlpha = a;
    }
  });
  // stats
  const st = ease((t - 0.5) / 0.8);
  ctx.globalAlpha = a * st;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = font(s / 11, 800);
  const km = Math.round(route.km * Math.min(1, prog * 1.1));
  ctx.fillText(`${km.toLocaleString()} km`, w / 2, h * 0.84 + (1 - st) * s * 0.05);
  ctx.font = font(s / 32, 600);
  ctx.fillStyle = "rgba(255,255,255,.8)";
  const sub = [route.from && route.to && route.from !== route.to ? `${route.from} → ${route.to}` : route.from, `${route.points.length} stops`, route.days > 1 ? `${route.days} days` : null].filter(Boolean).join(" · ");
  ctx.fillText(sub, w / 2, h * 0.84 + s / 18);
  ctx.restore();
}
