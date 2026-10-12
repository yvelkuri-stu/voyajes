/**
 * v0.8: execute core `fxOps` on a 2D canvas. Used by the live preview
 * (ThemeFxLayer), share playback and the MP4/WebM/GIF exporters — so the film
 * look is drawn by the very same code everywhere.
 */
import type { FxBlend, FxOp } from "@voyajes/core";

let grainTile: HTMLCanvasElement | OffscreenCanvas | null = null;
function grain(): HTMLCanvasElement | OffscreenCanvas {
  if (grainTile) return grainTile;
  const S = 160;
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(S, S) : Object.assign(document.createElement("canvas"), { width: S, height: S });
  const x = c.getContext("2d") as CanvasRenderingContext2D;
  const img = x.createImageData(S, S);
  let s = 1234567;
  for (let i = 0; i < S * S; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 8) & 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

const OP: Record<FxBlend, GlobalCompositeOperation> = {
  screen: "screen",
  multiply: "multiply",
  normal: "source-over",
  overlay: "overlay",
};

function rgba(hex: string, a: number): string {
  const s = hex.replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s.padEnd(6, "0");
  return `rgba(${parseInt(f.slice(0, 2), 16)},${parseInt(f.slice(2, 4), 16)},${parseInt(f.slice(4, 6), 16)},${Math.max(0, Math.min(1, a))})`;
}

function heartPath(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.75);
  ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.4);
  ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.75);
  ctx.closePath();
}

/**
 * Draw ops. `only` restricts to one blend group and draws it with
 * source-over (for the preview, where each group is its own canvas with a
 * CSS mix-blend-mode). Without `only`, real composite ops are used (export).
 */
export function drawFxOps(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, ops: FxOp[], w: number, h: number, only?: FxBlend): void {
  const c = ctx as CanvasRenderingContext2D;
  c.save();
  for (const op of ops) {
    if (only && op.blend !== only) continue;
    c.globalCompositeOperation = only ? "source-over" : OP[op.blend];
    c.globalAlpha = 1;
    switch (op.t) {
      case "rect":
        c.fillStyle = rgba(op.color, op.a);
        c.fillRect(op.x, op.y, op.w, op.h);
        break;
      case "lines": {
        c.fillStyle = rgba(op.color, op.a);
        for (let y = op.offset % op.spacing; y < h; y += op.spacing) c.fillRect(0, y, w, op.thick);
        break;
      }
      case "radial": {
        const g = c.createRadialGradient(op.cx, op.cy, op.edge ? op.r * (op.inner ?? 0) : 0, op.cx, op.cy, op.r);
        if (op.edge) {
          g.addColorStop(0, rgba(op.color, 0));
          g.addColorStop(1, rgba(op.color, op.a));
          c.fillStyle = g;
          c.fillRect(0, 0, w, h);
        } else {
          g.addColorStop(0, rgba(op.color, op.a));
          g.addColorStop(0.5, rgba(op.color, op.a * 0.25));
          g.addColorStop(1, rgba(op.color, 0));
          c.fillStyle = g;
          c.fillRect(op.cx - op.r, op.cy - op.r, op.r * 2, op.r * 2);
        }
        break;
      }
      case "shape": {
        c.save();
        c.translate(op.cx, op.cy);
        c.rotate(op.rot);
        if (op.shape === "soft") {
          const g = c.createRadialGradient(0, 0, 0, 0, 0, op.r);
          g.addColorStop(0, rgba(op.color, Math.min(1, op.a * 1.4)));
          g.addColorStop(0.5, rgba(op.color, op.a * 0.35));
          g.addColorStop(1, rgba(op.color, 0));
          c.fillStyle = g;
          c.beginPath();
          c.arc(0, 0, op.r, 0, Math.PI * 2);
          c.fill();
        } else {
          c.fillStyle = rgba(op.color, op.a);
          if (op.shape === "circle") {
            c.beginPath();
            c.arc(0, 0, op.r, 0, Math.PI * 2);
            c.fill();
          } else if (op.shape === "rect") c.fillRect(-op.r, -op.r * 0.45, op.r * 2, op.r * 0.9);
          else if (op.shape === "heart") {
            heartPath(c, op.r);
            c.fill();
          } else if (op.shape === "star") {
            c.beginPath();
            const r = op.r, q = r * 0.12;
            c.moveTo(0, -r); c.lineTo(q, -q); c.lineTo(r, 0); c.lineTo(q, q); c.lineTo(0, r); c.lineTo(-q, q); c.lineTo(-r, 0); c.lineTo(-q, -q);
            c.closePath();
            c.fill();
          }
        }
        c.restore();
        break;
      }
      case "grain": {
        const tile = grain() as CanvasImageSource;
        const pat = c.createPattern(tile, "repeat");
        if (!pat) break;
        const ox = ((op.seed * 53) % 160) | 0, oy = ((op.seed * 97) % 160) | 0;
        c.globalAlpha = op.amount;
        c.translate(-ox, -oy);
        c.fillStyle = pat;
        c.fillRect(ox, oy, w, h);
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = 1;
        break;
      }
    }
  }
  c.restore();
}
