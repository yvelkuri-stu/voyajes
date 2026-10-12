import { publicBase } from "../lib/publicUrl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InvitePlayer } from "./InvitePlayer";
import { fetchLive, hostSecretFor, releaseAfterMovie, shortUrlFor, vote, uploadAfterMovie, type LiveDrop, type LiveWall } from "../lib/api";
import { applyPortableUrlsToRecord, hydratePortablePack, type PortablePackV1 } from "../lib/portableShare";
import { buildAfterMoviePack, rankCut } from "../lib/afterMovie";
import { INBOX_EVENT, isFollowing, notifyMe, pushSupported } from "../lib/push";
import { qrMatrix } from "../lib/cards";
import "../styles/aftermovie.css";

export const appPath = (p: string) => `${publicBase()}${p}`;

/** Poll the live wall (drops + votes + after-movie state). */
export function useLiveWall(cloudId: string, ms = 8000) {
  const [wall, setWall] = useState<LiveWall | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setWall(await fetchLive(cloudId));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [cloudId]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), ms);
    const on = () => void load();
    window.addEventListener(INBOX_EVENT, on);
    return () => {
      clearInterval(t);
      window.removeEventListener(INBOX_EVENT, on);
    };
  }, [load, ms]);
  return { wall, err, reload: load, setWall };
}

/** Crowd voting: tap 🔥 on the moments that should make the cut. */
export function VoteStrip({ cloudId, wall, onChange }: { cloudId: string; wall: LiveWall; onChange: (w: LiveWall) => void }) {
  const [pop, setPop] = useState<string | null>(null);
  if (!wall.drops.length) return <p className="muted vj-small-text">No photos yet — be the first with the party camera.</p>;
  const cut = new Set(rankCut(wall.drops).map((c) => c.drop.id));
  const tap = async (d: LiveDrop) => {
    setPop(d.id);
    // optimistic
    onChange({ ...wall, drops: wall.drops.map((x) => (x.id === d.id ? { ...x, mine: !x.mine, votes: x.votes + (x.mine ? -1 : 1) } : x)) });
    try {
      const r = await vote(cloudId, d.id);
      onChange({ ...wall, drops: wall.drops.map((x) => (x.id === d.id ? { ...x, mine: r.voted, votes: r.votes } : x)) });
    } catch {
      onChange(wall);
    }
    setTimeout(() => setPop(null), 600);
  };
  return (
    <div className="am-votes" data-vote-strip>
      {wall.drops.slice(0, 40).map((d) => (
        <button
          key={d.id}
          type="button"
          className={`am-vote${d.mine ? " is-mine" : ""}${pop === d.id ? " is-pop" : ""}${cut.has(d.id) ? " in-cut" : ""}`}
          data-vote={d.id}
          aria-pressed={d.mine}
          aria-label={`Vote for ${d.name ? d.name + "'s" : "this"} moment (${d.votes})`}
          onClick={() => void tap(d)}
        >
          {d.mime.startsWith("video/") ? <video src={d.url} muted playsInline preload="metadata" /> : <img src={d.url} alt="" loading="lazy" />}
          <span className="am-vote-badge">🔥 {d.votes}</span>
        </button>
      ))}
    </div>
  );
}

export function NotifyButton({ cloudId, title }: { cloudId: string; title: string }) {
  const [state, setState] = useState<"idle" | "busy" | "push" | "in-app">(() => (isFollowing(cloudId) ? "in-app" : "idle"));
  if (state === "push" || state === "in-app")
    return (
      <p className="am-notify-on" data-notify-on={state}>
        {state === "push" ? "🔔 We'll ping this device when the after-movie drops." : "🔔 You'll see it here the moment the after-movie drops."}
      </p>
    );
  return (
    <button
      type="button"
      className="btn btn-ghost am-notify"
      data-notify-me
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        setState(await notifyMe(cloudId, title));
      }}
    >
      🔔 Tell me when the after-movie drops{pushSupported() ? "" : " (in-app)"}
    </button>
  );
}

/** Guests: after-movie player (once released) or the party camera + vote-the-cut while it's live. */
export function AfterMovieSection({ cloudId, pack }: { cloudId: string; pack: PortablePackV1 }) {
  const { wall, setWall } = useLiveWall(cloudId);
  const ref = useRef<HTMLElement>(null);
  const wantAm = new URLSearchParams(location.search).get("aftermovie") === "1";
  const amPack = useMemo(() => (wall?.aftermovieAt ? buildAfterMoviePack(pack, wall.drops) : null), [pack, wall?.aftermovieAt, wall?.drops.length]);
  const record = useMemo(() => {
    if (!amPack) return null;
    const h = hydratePortablePack(amPack);
    return applyPortableUrlsToRecord(h.record, h.objectUrls);
  }, [amPack]);
  useEffect(() => {
    if (wantAm && record) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [wantAm, !!record]);
  if (!wall) return null;
  const isInvite = pack.share.mode === "invitation";
  if (!isInvite && !wall.drops.length) return null;
  const title = pack.share.invitation?.eventName || pack.share.title;
  const amLink = `${shortUrlFor(cloudId)}?aftermovie=1`;
  const shareBack = async () => {
    const data = { title: `${title} · After-Movie`, text: "Our after-movie 🎬 made from everyone's photos", url: amLink };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(amLink);
    } catch {
      /* cancelled */
    }
  };
  return (
    <section
      ref={ref}
      className="am-section"
      data-aftermovie={record ? "ready" : "live"}
      data-cut-heroes={record ? rankCut(wall.drops).filter((c) => c.hero).map((c) => c.drop.id).join(",") : undefined}
      aria-label="After-movie"
    >
      {record ? (
        <>
          <header className="am-head">
            <span className="am-chip">🎬 After-Movie</span>
            <h3>{record.title}</h3>
            <p className="muted vj-small-text">
              {wall.drops.length} moments from {new Set(wall.drops.map((d) => d.name || d.id)).size} guests · cut by your votes
            </p>
          </header>
          <div className="am-player" data-aftermovie-player>
            {wall.aftermovieUrl ? <video src={wall.aftermovieUrl} controls playsInline autoPlay={wantAm} muted={wantAm} data-aftermovie-video /> : <InvitePlayer key={record.clipCount} record={record} autoPlay={wantAm} />}
          </div>
          <div className="am-actions">
            <button type="button" className="btn btn-primary" data-aftermovie-share onClick={() => void shareBack()}>
              Share the after-movie
            </button>
            <Link className="btn btn-ghost" to={`/live/${cloudId}`}>
              📸 Add more
            </Link>
          </div>
          <details className="am-more">
            <summary>Vote the cut · {wall.drops.length}</summary>
            <VoteStrip cloudId={cloudId} wall={wall} onChange={setWall} />
          </details>
        </>
      ) : (
        <>
          <header className="am-head">
            <span className="am-chip am-chip-live">● Live</span>
            <h3>Party camera</h3>
            <p className="muted vj-small-text">Snap it, drop it. After the party, everyone's best shots become the after-movie.</p>
          </header>
          <div className="am-actions">
            <Link className="btn btn-primary am-cam-btn" to={`/live/${cloudId}`} data-open-party-camera>
              📸 Open party camera
            </Link>
            <NotifyButton cloudId={cloudId} title={title} />
          </div>
          {!!wall.drops.length && (
            <>
              <p className="am-sub">Vote the cut · 🔥 the moments you love</p>
              <VoteStrip cloudId={cloudId} wall={wall} onChange={setWall} />
            </>
          )}
        </>
      )}
    </section>
  );
}

/** Host: party camera + TV links, live count, release the after-movie now (auto at event end). */
export function AfterMovieHost({ cloudId, pack }: { cloudId: string; pack: PortablePackV1 }) {
  const { wall, reload } = useLiveWall(cloudId, 10000);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!hostSecretFor(cloudId)) return null;
  const end = wall?.eventEnd ? new Date(wall.eventEnd) : null;
  const release = async () => {
    setBusy(true);
    try {
      const r = await releaseAfterMovie(cloudId);
      setMsg(r.notified ? `After-movie shared with guests 🎉${r.pushed ? ` · ${r.pushed} push` : ""}` : "Already shared — guests see the latest cut");
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const attachVideo = async () => {
    const amPack = wall && buildAfterMoviePack(pack, wall.drops);
    if (!amPack) return setMsg("No guest photos yet");
    setBusy(true);
    try {
      const { exportSlideshowWebm } = await import("../lib/exportWebm");
      const { getThemeById } = await import("../data/themes");
      const { getBeatByRef } = await import("../data/beats");
      const pb = amPack.share.playback!;
      const theme = getThemeById(pb.themeId) ?? getThemeById("theme.ocean-pop")!;
      const beat = getBeatByRef(pb.audioTrackRef);
      const res = await exportSlideshowWebm({
        clips: pb.clips.map((c) => ({ id: c.id, kind: c.kind, objectUrl: amPack.media[c.id].url!, fileName: c.fileName, durationSec: c.durationSec, transitionOut: c.transitionOut })),
        theme,
        title: amPack.share.title,
        aspect: "9:16",
        transition: pb.transitionOverride ?? theme.transition,
        audio: beat?.previewUrl ? { previewUrl: beat.previewUrl, beatName: beat.name } : undefined,
        shortEdge: 720,
        burnTitle: true,
        captionText: pb.captionText,
        onProgress: (p) => setMsg(`Rendering · ${Math.round(p.ratio * 100)}%`),
      });
      await uploadAfterMovie(cloudId, res.blob);
      setMsg(`Video attached ✓ · ${res.engine === "webcodecs" ? "fast export (WebCodecs)" : "MediaRecorder"} · ${((res.elapsedMs ?? 0) / 1000).toFixed(1)}s for ${Math.round(res.durationSec)}s of film`);
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="am-host" data-aftermovie-host>
      <h4>🎬 After-Movie</h4>
      <p className="muted vj-small-text">
        {wall?.aftermovieAt
          ? `Shared with guests ${new Date(wall.aftermovieAt).toLocaleString()}`
          : end
            ? `Guests get it automatically after ${end.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
            : "Guests get it when you share it"}
        {wall ? ` · ${wall.drops.length} live photos · ${wall.drops.reduce((n, d) => n + d.votes, 0)} votes` : ""}
      </p>
      <div className="am-actions">
        <Link className="btn btn-ghost vj-small" to={`/live/${cloudId}`} data-host-party-camera>
          📸 Party camera
        </Link>
        <Link className="btn btn-ghost vj-small" to={`/tv/${cloudId}`} data-tv-link>
          📺 TV mode
        </Link>
        <button type="button" className="btn btn-primary vj-small" data-release-aftermovie disabled={busy || !wall?.drops.length} onClick={() => void release()}>
          {wall?.aftermovieAt ? "Re-share after-movie" : "Share after-movie now"}
        </button>
      </div>
      <details className="am-more vj-pro">
        <summary>Pro</summary>
        <button type="button" className="btn btn-ghost vj-small" data-aftermovie-render disabled={busy} onClick={() => void attachVideo()}>
          Render & attach a video file
        </button>
      </details>
      {msg && (
        <p className="muted vj-small-text" role="status" data-aftermovie-msg>
          {msg}
        </p>
      )}
    </div>
  );
}

export function QrSvg({ text, className }: { text: string; className?: string }) {
  const m = useMemo(() => qrMatrix(text), [text]);
  const n = m.length;
  let d = "";
  m.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x + 2} ${y + 2}h1v1h-1z`)));
  return (
    <svg className={className} viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label="QR code" data-qr={text}>
      <rect width={n + 4} height={n + 4} fill="#fff" rx="1.5" />
      <path d={d} fill="#0B0D12" />
    </svg>
  );
}

/** In-app notification for immersive pages (no header bell): slides in, links straight to the moment. */
export function InboxToast() {
  const [n, setN] = useState<{ voyageId: string; notice: { title: string; body: string; kind: string } } | null>(null);
  useEffect(() => {
    let t = 0;
    const on = (e: Event) => {
      setN((e as CustomEvent).detail);
      clearTimeout(t);
      t = window.setTimeout(() => setN(null), 12000);
    };
    window.addEventListener(INBOX_EVENT, on);
    return () => {
      window.removeEventListener(INBOX_EVENT, on);
      clearTimeout(t);
    };
  }, []);
  if (!n) return null;
  return (
    <div className="am-inbox-toast" role="status" data-inbox-toast>
      <strong>{n.notice.title}</strong>
      <span>{n.notice.body}</span>
      <div className="am-actions">
        {n.notice.kind === "aftermovie" && (
          <Link className="btn btn-primary vj-small" to={`/v/${n.voyageId}?aftermovie=1`} onClick={() => setN(null)}>
            Watch
          </Link>
        )}
        <button type="button" className="btn btn-ghost vj-small" onClick={() => setN(null)}>
          Later
        </button>
      </div>
    </div>
  );
}
