import { useEffect, useRef } from "react";
import { fxOps, lookBackground, lookGradeCss, THEME_LOOKS, type ThemeLook } from "@voyajes/core";
import { drawFxOps } from "../lib/themeFx";

/** One frame of the look rendered over the user's own photo (same code path as export). */
function LookThumb({ look, intensity, src }: { look: ThemeLook; intensity: number; src?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = 150, h = 240;
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    if (!x) return;
    let alive = true;
    const paint = (img?: HTMLImageElement) => {
      if (!alive) return;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = "source-over";
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, look.bg[1]);
      g.addColorStop(1, look.bg[0]);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      if (img && img.naturalWidth) {
        const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        x.filter = lookGradeCss(look, intensity);
        x.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        x.filter = "none";
      }
      drawFxOps(x, fxOps(look, intensity, 2.4, w, h), w, h);
    };
    if (src) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => paint(img);
      img.onerror = () => paint();
      img.src = src;
    } else paint();
    return () => {
      alive = false;
    };
  }, [look, intensity, src]);
  return <canvas ref={ref} className="vj-look-thumb" aria-hidden />;
}

export function ThemePicker({
  themeId,
  intensity,
  previewSrc,
  available,
  onPick,
  onIntensity,
}: {
  themeId: string;
  intensity: number;
  previewSrc?: string;
  available?: string[];
  onPick: (id: string, how: "tap" | "swipe" | "surprise") => void;
  onIntensity: (v: number) => void;
}) {
  const looks = THEME_LOOKS.filter((l) => !available || available.includes(l.id));
  const strip = useRef<HTMLDivElement>(null);
  const settle = useRef(0);
  const programmatic = useRef(false);
  const current = looks.find((l) => l.id === themeId) ?? looks[0];

  // keep the active card centred
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-look="${themeId}"]`);
    if (!el || !strip.current) return;
    programmatic.current = true;
    strip.current.scrollTo({ left: el.offsetLeft - (strip.current.clientWidth - el.clientWidth) / 2, behavior: "smooth" });
    const t = window.setTimeout(() => (programmatic.current = false), 500);
    return () => window.clearTimeout(t);
  }, [themeId]);

  const onScroll = () => {
    if (programmatic.current) return;
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const s = strip.current;
      if (!s) return;
      const mid = s.scrollLeft + s.clientWidth / 2;
      let best: HTMLElement | null = null;
      let bd = Infinity;
      s.querySelectorAll<HTMLElement>("[data-look]").forEach((el) => {
        const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - mid);
        if (d < bd) {
          bd = d;
          best = el;
        }
      });
      const id = (best as HTMLElement | null)?.dataset.look;
      if (id && id !== themeId) onPick(id, "swipe");
    }, 260);
  };

  return (
    <div className="vj-theme-picker" style={{ background: lookBackground(current) }}>
      <div className="vj-theme-picker-head">
        <div>
          <div className="vj-theme-picker-title">
            {current.emoji} {current.name}
          </div>
          <div className="vj-theme-picker-vibe">
            {current.vibe} · ♪ {current.music.name}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary vj-surprise"
          data-theme-surprise
          onClick={() => {
            const others = looks.filter((l) => l.id !== themeId);
            onPick(others[Math.floor(Math.random() * others.length)].id, "surprise");
          }}
        >
          🎲 Surprise me
        </button>
      </div>
      <div className="vj-theme-strip" ref={strip} onScroll={onScroll} role="listbox" aria-label="Themes">
        {looks.map((l) => (
          <button
            key={l.id}
            type="button"
            role="option"
            aria-selected={l.id === themeId}
            data-look={l.id}
            className={`vj-look-card${l.id === themeId ? " is-active" : ""}`}
            style={{ "--look-accent": l.accent } as React.CSSProperties}
            onClick={() => onPick(l.id, "tap")}
          >
            <LookThumb look={l} intensity={intensity} src={previewSrc} />
            <span className="vj-look-name">
              {l.emoji} {l.name}
            </span>
            <span className="vj-look-music">♪ {l.music.name}</span>
          </button>
        ))}
      </div>
      <label className="vj-intensity">
        <span>Subtle</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={intensity}
          aria-label="Theme intensity"
          data-theme-intensity
          onChange={(e) => onIntensity(Number(e.target.value))}
        />
        <span>Bold</span>
      </label>
    </div>
  );
}
