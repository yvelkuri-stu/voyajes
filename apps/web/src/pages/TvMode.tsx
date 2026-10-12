import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchVoyage, isCloudId, type CloudVoyage, type LiveDrop } from "../lib/api";
import { QrSvg, appPath, useLiveWall } from "../components/AfterMovie";
import "../styles/aftermovie.css";

const SLIDE_MS = 5000;

/** v1.0 TV mode: a live, themed slideshow of the party camera for the big screen. */
export function TvMode() {
  const { id = "" } = useParams();
  const [v, setV] = useState<CloudVoyage | null>(null);
  const { wall } = useLiveWall(id, 5000);
  const [idx, setIdx] = useState(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (isCloudId(id)) fetchVoyage(id).then(setV, () => undefined);
  }, [id]);

  // newest-first from the API → show in arrival order; jump to brand-new drops immediately
  const slides: LiveDrop[] = useMemo(() => [...(wall?.drops ?? [])].reverse(), [wall?.drops]);
  useEffect(() => {
    if (!wall) return;
    const ids = new Set(wall.drops.map((d) => d.id));
    if (seen.current) {
      const n = wall.drops.find((d) => !seen.current!.has(d.id));
      if (n) {
        setFresh(n.id);
        setIdx(slides.findIndex((s) => s.id === n.id));
      }
    }
    seen.current = ids;
  }, [wall?.drops.length]);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setTimeout(() => {
      setFresh(null);
      setIdx((i) => (i + 1) % slides.length);
    }, SLIDE_MS);
    return () => clearTimeout(t);
  }, [idx, slides.length]);

  const cur = slides[Math.min(idx, slides.length - 1)];
  const prev = slides.length > 1 ? slides[(Math.min(idx, slides.length - 1) - 1 + slides.length) % slides.length] : null;
  const grad = v?.pack.share.themeGradient || "linear-gradient(135deg,#ff4d8d,#7c5cff 55%,#00d1ff)";
  const title = v?.pack.share.invitation?.eventName || v?.title || wall?.title || "Live";
  const camUrl = appPath(`/live/${id}`);
  const top = [...(wall?.drops ?? [])].sort((a, b) => b.votes - a.votes)[0];
  return (
    <main className="am-tv" style={{ ["--am-grad" as string]: grad }} data-tv-mode onDoubleClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>
      <div className="am-tv-bg" aria-hidden />
      {cur ? (
        <div className="am-tv-stage">
          {prev && prev.id !== cur.id && <Slide key={`p-${prev.id}-${idx}`} d={prev} out />}
          <Slide key={`c-${cur.id}-${idx}`} d={cur} fresh={fresh === cur.id} />
        </div>
      ) : (
        <div className="am-tv-empty">
          <h1>{title}</h1>
          <p>Scan the code and snap the first photo ✨</p>
        </div>
      )}
      <header className="am-tv-top">
        <span className="am-chip am-chip-live">● Live</span>
        <h2>{title}</h2>
        <span className="am-tv-count" data-tv-count>{wall?.drops.length ?? 0} moments</span>
      </header>
      {cur && (
        <div className="am-tv-cap" key={`cap-${cur.id}-${idx}`} data-tv-slide={cur.id}>
          {fresh === cur.id && <span className="am-tv-new">New</span>}
          📸 {cur.name || "a guest"} {cur.votes > 0 && <span className="am-tv-votes">🔥 {cur.votes}</span>}
          {top && top.id === cur.id && top.votes > 0 && <span className="am-tv-crown">Crowd favourite</span>}
        </div>
      )}
      <aside className="am-tv-join">
        <QrSvg text={camUrl} className="am-tv-qr" />
        <span>Scan to add your photos</span>
      </aside>
    </main>
  );
}

function Slide({ d, out, fresh }: { d: LiveDrop; out?: boolean; fresh?: boolean }) {
  const cls = `am-tv-slide${out ? " is-out" : " is-in"}${fresh ? " is-fresh" : ""}`;
  return (
    <div className={cls}>
      {d.mime.startsWith("video/") ? (
        <video src={d.url} autoPlay muted loop playsInline />
      ) : (
        <>
          <img className="am-tv-blur" src={d.url} alt="" aria-hidden />
          <img className="am-tv-img" src={d.url} alt={d.name ? `Photo by ${d.name}` : "Guest photo"} />
        </>
      )}
    </div>
  );
}
