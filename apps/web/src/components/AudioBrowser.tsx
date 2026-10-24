/**
 * v1.3 audio browser — real, licence-verified recordings.
 * Category chips · search · waveform preview with live playhead · BPM · one-tap Use · credits.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTracks, type BeatCard } from "../data/beats";
import { AUDIO_CATEGORIES, creditLine } from "../data/library";
import "../styles/audio-browser.css";

const CAT_HUE: Record<string, string> = {
  "festive-indian": "linear-gradient(135deg,#ff9a3c,#ff3d7f)",
  devotional: "linear-gradient(135deg,#ffd166,#f77f00)",
  lullaby: "linear-gradient(135deg,#a0c4ff,#ffc6ff)",
  upbeat: "linear-gradient(135deg,#ffe600,#ff5ec4)",
  cinematic: "linear-gradient(135deg,#6a5cff,#00d4ff)",
  chill: "linear-gradient(135deg,#3ddc97,#00b4d8)",
  genz: "linear-gradient(135deg,#b14cff,#00f5d4)",
  sfx: "linear-gradient(135deg,#fdfcdc,#ffb4a2)",
};

function licBadge(t: BeatCard): { text: string; cls: string } {
  const l = t.credit?.license ?? (t.attribution?.includes("CC BY") ? "CC BY 3.0" : "");
  if (l.startsWith("CC0")) return { text: "CC0", cls: "is-cc0" };
  if (l.toLowerCase().startsWith("public")) return { text: "Public domain", cls: "is-pd" };
  if (l.startsWith("CC BY")) return { text: l.replace(" ", "\u00a0"), cls: "is-by" };
  return { text: "Voyajes", cls: "is-pd" };
}

function fmt(sec?: number) {
  if (!sec) return "";
  return sec >= 60 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}` : `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
}

function Wave({ peaks, progress, playing }: { peaks?: number[]; progress: number; playing: boolean }) {
  const p = peaks?.length ? peaks : Array.from({ length: 48 }, (_, i) => 0.35 + 0.25 * Math.sin(i * 0.7));
  const n = p.length;
  return (
    <svg className={`vj-ab-wave${playing ? " is-playing" : ""}`} viewBox={`0 0 ${n * 3} 32`} preserveAspectRatio="none" aria-hidden>
      {p.map((v, i) => {
        const h = Math.max(2, v * 30);
        const played = i / n < progress;
        return <rect key={i} x={i * 3} y={16 - h / 2} width={2} height={h} rx={1} className={played ? "is-played" : undefined} />;
      })}
    </svg>
  );
}

export function AudioBrowser({
  currentRef,
  onUse,
  onStatus,
}: {
  currentRef?: string;
  /** Loops replace the music bed; SFX are dropped at the playhead. */
  onUse: (track: BeatCard) => void;
  onStatus?: (msg: string) => void;
}) {
  const all = useMemo(() => getAllTracks(), []);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((t) => {
      if (cat !== "all" && (t.category ?? "chill") !== cat) return false;
      if (!needle) return true;
      const hay = `${t.name} ${t.mood.join(" ")} ${(t.tags ?? []).join(" ")} ${t.credit?.author ?? ""} ${t.credit?.work ?? ""} ${t.category ?? ""}`.toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [all, cat, q]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of all) m[t.category ?? "chill"] = (m[t.category ?? "chill"] ?? 0) + 1;
    return m;
  }, [all]);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
    setProgress(0);
  };
  useEffect(() => () => stop(), []);

  const toggle = (t: BeatCard) => {
    if (playing === t.packRef) return stop();
    stop();
    if (!t.previewUrl) return;
    const a = new Audio(t.previewUrl);
    a.loop = t.audioType !== "sfx";
    a.preload = "auto";
    audio.current = a;
    setPlaying(t.packRef);
    a.onended = () => stop();
    a.onerror = () => {
      onStatus?.(`Could not play ${t.name} — offline?`);
      stop();
    };
    void a.play().catch(() => stop());
    const tick = () => {
      if (!audio.current) return;
      const d = audio.current.duration || t.durationSec || 1;
      setProgress((audio.current.currentTime % d) / d);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const copyCredit = (t: BeatCard) => {
    const line = t.credit ? `${creditLine(t.credit)} · ${t.credit.sourceUrl}` : t.attribution ?? t.name;
    void navigator.clipboard?.writeText(line).then(
      () => onStatus?.("Credit copied — paste it in your post caption"),
      () => onStatus?.(line),
    );
  };

  return (
    <div className="vj-ab" data-audio-browser>
      <div className="vj-ab-search">
        <span aria-hidden>🔎</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search shehnai, lullaby, dhol, wedding…"
          aria-label="Search sounds"
          data-audio-search
        />
        {q && (
          <button type="button" className="vj-ab-x" onClick={() => setQ("")} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>
      <div className="vj-ab-cats" role="tablist" aria-label="Sound categories">
        <button type="button" role="tab" aria-selected={cat === "all"} className={`vj-ab-cat${cat === "all" ? " is-on" : ""}`} onClick={() => setCat("all")}>
          🎧 All <small>{all.length}</small>
        </button>
        {AUDIO_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={cat === c.id}
            className={`vj-ab-cat${cat === c.id ? " is-on" : ""}`}
            style={{ ["--cat" as string]: CAT_HUE[c.id] }}
            onClick={() => setCat(c.id)}
            data-audio-cat={c.id}
          >
            {c.emoji} {c.label} <small>{counts[c.id] ?? 0}</small>
          </button>
        ))}
      </div>
      <ul className="vj-ab-list" aria-label="Sounds">
        {list.map((t) => {
          const on = currentRef === t.packRef;
          const isPlaying = playing === t.packRef;
          const lic = licBadge(t);
          return (
            <li
              key={t.packRef}
              className={`vj-ab-row${on ? " is-current" : ""}${isPlaying ? " is-playing" : ""}`}
              style={{ ["--cat" as string]: CAT_HUE[t.category ?? "chill"] }}
              data-audio-track={t.packRef}
            >
              <button type="button" className="vj-ab-play" onClick={() => toggle(t)} aria-label={isPlaying ? `Stop ${t.name}` : `Preview ${t.name}`}>
                {isPlaying ? "■" : "▶"}
              </button>
              <div className="vj-ab-main">
                <div className="vj-ab-title">
                  <strong>{t.name}</strong>
                  {on && <span className="vj-ab-now">Now</span>}
                </div>
                <Wave peaks={t.peaks} progress={isPlaying ? progress : 0} playing={isPlaying} />
                <div className="vj-ab-meta">
                  {t.audioType === "sfx" ? "SFX" : t.pulse === "free" ? "free time" : `${t.bpm} BPM`}
                  {t.durationSec ? ` · ${fmt(t.durationSec)}` : ""}
                  {t.credit ? ` · ${t.credit.author.replace(/ \(.*\)$/, "")}` : ""}
                  <button type="button" className={`vj-ab-lic ${lic.cls}`} onClick={() => copyCredit(t)} title={`${t.credit ? creditLine(t.credit) : t.attribution ?? ""} — tap to copy credit`}>
                    {lic.text}
                  </button>
                </div>
              </div>
              <button type="button" className="vj-ab-use" onClick={() => { stop(); onUse(t); }} aria-label={`Use ${t.name}`} data-audio-use>
                {t.audioType === "sfx" ? "＋ Add" : on ? "✓" : "Use"}
              </button>
            </li>
          );
        })}
        {!list.length && <li className="vj-ab-empty muted">No sounds match “{q}”.</li>}
      </ul>
      <p className="vj-ab-foot muted">
        Real recordings · CC0, public domain &amp; CC BY. CC BY tracks need a credit when you post — tap the licence badge to copy it.{" "}
        <Link to="/credits">All credits →</Link>
      </p>
    </div>
  );
}
