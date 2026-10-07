import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { TransitionKind } from "@voyajes/core";
import { getBeatByRef } from "../data/beats";
import { getThemeById, type ThemeCard } from "../data/themes";
import { assetUrl } from "../lib/assetUrl";
import { startBeatPreview, type PreviewHandle } from "../lib/beatPreview";
import { getBlob, transitionIntoClip, type DraftClipMeta } from "../lib/draftStore";
import { buildInviteCardLines } from "../lib/inviteCard";
import type { SharePlaybackSnapshot, ShareRecord } from "../lib/shareStore";

type LiveClip = DraftClipMeta & { objectUrl: string };

function aspectCss(aspect: string): string {
  if (aspect === "16:9") return "16 / 9";
  if (aspect === "1:1") return "1 / 1";
  if (aspect === "4:5") return "4 / 5";
  return "9 / 16";
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const INTRO_SEC = 2.4;
const END_SEC = 2.6;

type Props = {
  record: ShareRecord;
  /** Auto-start when mounts (e.g. after tapping Play). */
  autoPlay?: boolean;
  /** Fill most of the viewport (guest immersive). */
  immersive?: boolean;
  onCloseFullscreen?: () => void;
  onEnded?: () => void;
};

/**
 * Guest-facing animated playback that mirrors Create preview:
 * same theme grade, transitions, text styles, and catalog beat.
 * Media resolves from IndexedDB clip ids stored on the share snapshot.
 * Invitation mode: intro/end cards with who/what/when/where — no default title burn.
 */
export function InvitePlayer({
  record,
  autoPlay = false,
  immersive = false,
  onCloseFullscreen,
  onEnded,
}: Props) {
  const playback: SharePlaybackSnapshot | null = record.playback;
  const theme: ThemeCard =
    getThemeById(playback?.themeId ?? record.themeId) ??
    getThemeById("theme.ocean-pop")!;

  const videoRef = useRef<HTMLVideoElement>(null);
  const advanceTimer = useRef<number | null>(null);
  const previewHandle = useRef<PreviewHandle | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const [clips, setClips] = useState<LiveClip[]>([]);
  const [ready, setReady] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transitionKey, setTransitionKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [mediaMissing, setMediaMissing] = useState(false);
  /** -1 intro · 0..n-1 clips · n end card */
  const [phase, setPhase] = useState<"intro" | "clips" | "end">("clips");

  const invitation = record.invitation ?? playback?.invitation;
  const isInvitation = record.mode === "invitation";
  const cardLines = useMemo(
    () => buildInviteCardLines(invitation, record.title),
    [invitation, record.title],
  );
  const showInviteCards = isInvitation && cardLines.hasContent;

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimer.current) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const metas = playback?.clips ?? [];
      const live: LiveClip[] = [];
      for (const meta of metas) {
        const blob = await getBlob(meta.id);
        if (cancelled) return;
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          objectUrlsRef.current.add(objectUrl);
          live.push({ ...meta, objectUrl });
        }
      }
      setClips(live);
      setMediaMissing(metas.length > 0 && live.length === 0);
      setReady(true);
      if (autoPlay) {
        setPhase(showInviteCards ? "intro" : "clips");
        setPlaying(true);
      }
    })();
    return () => {
      cancelled = true;
      clearAdvanceTimer();
      previewHandle.current?.stop();
      previewHandle.current = null;
      for (const u of objectUrlsRef.current) URL.revokeObjectURL(u);
      objectUrlsRef.current.clear();
    };
  }, [playback, autoPlay, clearAdvanceTimer, showInviteCards]);

  const active = phase === "clips" ? clips[activeIndex] : undefined;
  const globalTransition: TransitionKind =
    playback?.transitionOverride ?? theme.transition;
  const activeTransition = transitionIntoClip(clips, activeIndex, globalTransition);
  const transitionClass = `tx-${activeTransition}`;
  const kenBurns =
    active?.kind === "image" && theme.photoMotion !== "off"
      ? theme.photoMotion === "bold"
        ? "ken-bold"
        : "ken-gentle"
      : "";

  const clipsDuration = useMemo(
    () => clips.reduce((sum, c) => sum + c.durationSec, 0),
    [clips],
  );
  const totalDuration =
    clipsDuration +
    (showInviteCards ? INTRO_SEC + END_SEC : 0);

  const trackElapsed = useMemo(() => {
    if (phase === "intro") return elapsed;
    if (phase === "end") {
      return (showInviteCards ? INTRO_SEC : 0) + clipsDuration + elapsed;
    }
    let before = showInviteCards ? INTRO_SEC : 0;
    for (let i = 0; i < activeIndex && i < clips.length; i++) {
      before += clips[i].durationSec;
    }
    return before + elapsed;
  }, [phase, activeIndex, clips, elapsed, clipsDuration, showInviteCards]);

  const goToClip = useCallback(
    (index: number, resetElapsed = true) => {
      if (clips.length === 0) return;
      const next = ((index % clips.length) + clips.length) % clips.length;
      setActiveIndex(next);
      setTransitionKey((k) => k + 1);
      if (resetElapsed) setElapsed(0);
    },
    [clips.length],
  );

  const startPlayback = useCallback(() => {
    setPhase(showInviteCards ? "intro" : "clips");
    setActiveIndex(0);
    setElapsed(0);
    setPlaying(true);
  }, [showInviteCards]);

  // Phase / clip advance while playing
  useEffect(() => {
    clearAdvanceTimer();
    if (!playing) return;

    if (phase === "intro") {
      const remaining = Math.max(0.05, INTRO_SEC - elapsed) * 1000;
      advanceTimer.current = window.setTimeout(() => {
        setElapsed(0);
        if (clips.length > 0) {
          setPhase("clips");
          setActiveIndex(0);
          setTransitionKey((k) => k + 1);
        } else if (showInviteCards) {
          setPhase("end");
        } else {
          setPlaying(false);
          onEnded?.();
        }
      }, remaining);
      return clearAdvanceTimer;
    }

    if (phase === "end") {
      const remaining = Math.max(0.05, END_SEC - elapsed) * 1000;
      advanceTimer.current = window.setTimeout(() => {
        setPlaying(false);
        setElapsed(0);
        onEnded?.();
      }, remaining);
      return clearAdvanceTimer;
    }

    if (clips.length === 0) {
      if (showInviteCards) {
        setPhase("end");
        setElapsed(0);
      } else {
        setPlaying(false);
      }
      return;
    }

    const clip = clips[activeIndex];
    if (!clip) return;
    const remaining = Math.max(0.05, clip.durationSec - elapsed) * 1000;
    advanceTimer.current = window.setTimeout(() => {
      if (activeIndex >= clips.length - 1) {
        if (showInviteCards) {
          setElapsed(0);
          setPhase("end");
        } else {
          setPlaying(false);
          setElapsed(0);
          goToClip(0);
          onEnded?.();
        }
        return;
      }
      setElapsed(0);
      goToClip(activeIndex + 1);
    }, remaining);
    return clearAdvanceTimer;
  }, [
    playing,
    phase,
    activeIndex,
    clips,
    elapsed,
    clearAdvanceTimer,
    goToClip,
    showInviteCards,
    onEnded,
  ]);

  // Tick elapsed while playing (for progress display)
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setElapsed((e) => e + 0.25);
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, phase, activeIndex]);

  // Video element play/pause — retry after user gesture (autoPlay prop)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active || active.kind !== "video") return;
    if (playing) {
      void v.play().catch(() => {
        /* autoplay blocked — controls remain */
      });
    } else {
      v.pause();
    }
  }, [playing, active, activeIndex, transitionKey]);

  // Beat audio alongside slideshow
  useEffect(() => {
    previewHandle.current?.stop();
    previewHandle.current = null;
    if (!playing || !playback) return;
    if (phase === "intro" || phase === "end") {
      // Soft: still play beat under cards
    }
    const beat = getBeatByRef(playback.audioTrackRef);
    const url = beat?.previewUrl ? assetUrl(beat.previewUrl) : undefined;
    if (!url) return;
    previewHandle.current = startBeatPreview({
      previewUrl: url,
      bpm: beat?.bpm ?? 100,
      mood: beat?.mood ?? [],
    });
    return () => {
      previewHandle.current?.stop();
      previewHandle.current = null;
    };
  }, [playing, playback, phase]);

  const overlays = playback?.textOverlays ?? [];
  const aspect = playback?.aspect ?? "9:16";

  const activeOverlays = overlays.filter((o) => {
    if (phase !== "clips") return false;
    const t = trackElapsed - (showInviteCards ? INTRO_SEC : 0);
    return o.value.trim() && t >= o.at && t < o.end;
  });

  const enterFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else setFullscreen(true);
      setFullscreen(true);
      if (!playing) startPlayback();
    } catch {
      setFullscreen(true);
      if (!playing) startPlayback();
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
    setFullscreen(false);
    onCloseFullscreen?.();
  };

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (!ready) {
    return <p className="muted" style={{ textAlign: "center" }}>Loading invitation…</p>;
  }

  const textStyle = playback?.textStyle ?? "clean-sans";
  const stageStyle: CSSProperties = immersive
    ? {
        aspectRatio: aspectCss(aspect),
        width:
          aspect === "9:16" || aspect === "4:5"
            ? "min(100%, min(92vw, 480px))"
            : "min(100%, 720px)",
        maxHeight: "min(82vh, 860px)",
        margin: "0 auto",
      }
    : {
        aspectRatio: aspectCss(aspect),
        width:
          aspect === "9:16" || aspect === "4:5"
            ? "min(100%, 360px)"
            : "100%",
        maxHeight:
          aspect === "9:16" || aspect === "4:5" ? "70vh" : 420,
        margin: fullscreen ? "0 auto" : undefined,
      };

  const cardEl = (kind: "intro" | "end") => (
    <div
      className={`invite-card invite-card-${kind} text-style-${textStyle}`}
      style={{
        background: theme.gradient || record.themeGradient,
        color: theme.palette.text,
      }}
    >
      <div className="invite-card-inner">
        <div className="invite-card-kicker">
          {kind === "intro" ? "Invitation" : "See you there"}
        </div>
        <div className="invite-card-headline">{cardLines.headline}</div>
        {cardLines.subline ? (
          <div className="invite-card-sub">{cardLines.subline}</div>
        ) : null}
        {cardLines.detail ? (
          <div className="invite-card-detail">{cardLines.detail}</div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className={`invite-player-root${immersive ? " is-immersive" : ""}`}>
      <div
        ref={wrapRef}
        className={`invite-player-wrap${fullscreen ? " is-fullscreen" : ""}${
          immersive ? " is-immersive" : ""
        }`}
      >
        <div className="preview-stage" style={stageStyle}>
          {phase === "intro" && showInviteCards ? (
            cardEl("intro")
          ) : phase === "end" && showInviteCards ? (
            cardEl("end")
          ) : active ? (
            <div
              key={`${active.id}-${transitionKey}`}
              className={`preview-media ${transitionClass} ${kenBurns}`}
              style={
                {
                  "--tx-ms": `${theme.transitionDurationMs}ms`,
                  "--tx-ease":
                    theme.motion === "snappy"
                      ? "var(--motion-snappy)"
                      : theme.motion === "float" || theme.motion === "cinematic"
                        ? "var(--motion-float)"
                        : "var(--motion-soft)",
                } as CSSProperties
              }
            >
              {active.kind === "image" ? (
                <img src={active.objectUrl} alt="" draggable={false} />
              ) : (
                <video
                  ref={videoRef}
                  src={active.objectUrl}
                  muted={active.mute}
                  playsInline
                  loop={false}
                />
              )}
            </div>
          ) : (
            <div className="preview-empty">
              <div className="display" style={{ fontSize: "1.1rem" }}>
                {mediaMissing ? "Media not on this device" : "No clips yet"}
              </div>
              <div className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                {mediaMissing
                  ? "Open the invite on the host’s browser (local media) until cloud sync ships."
                  : "The host hasn’t added photos yet."}
              </div>
            </div>
          )}

          {phase === "clips" && (
            <>
              <div
                className="grade"
                style={{
                  background: theme.gradient || record.themeGradient,
                  mixBlendMode: "soft-light",
                  opacity: active ? 0.45 : 0.55,
                }}
              />
              <div
                className="grade grade-vignette"
                style={{
                  background: `radial-gradient(ellipse at center, transparent 40%, ${theme.palette.bg}cc 100%)`,
                  opacity: active ? 0.7 : 0.4,
                }}
              />
            </>
          )}

          {/* Timed overlays only — no default title/meta on the canvas */}
          {activeOverlays.map((o) => (
            <div
              key={o.id}
              className={`preview-overlay text-style-${o.style} text-tx-${o.animationIn} overlay-pos-${o.position}`}
              style={{ color: o.color || theme.palette.text }}
            >
              {o.value}
            </div>
          ))}
          {(playback?.watermark ?? false) && phase === "clips" && (
            <div className="preview-watermark" aria-hidden>
              Voyajes
            </div>
          )}
        </div>
      </div>

      <div className="invite-controls">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "8px 16px" }}
          disabled={clips.length === 0 && !showInviteCards}
          onClick={() => {
            if (phase === "clips") goToClip(activeIndex - 1);
            else if (phase === "end") {
              setPhase("clips");
              goToClip(Math.max(0, clips.length - 1));
              setPlaying(true);
            } else {
              setPhase("intro");
              setElapsed(0);
            }
          }}
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "8px 20px", minWidth: 96 }}
          disabled={clips.length === 0 && !showInviteCards}
          onClick={() => {
            if (!playing && phase === "end") {
              startPlayback();
              return;
            }
            if (!playing && phase === "clips" && activeIndex === 0 && elapsed === 0 && showInviteCards) {
              startPlayback();
              return;
            }
            setPlaying((p) => !p);
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "8px 16px" }}
          disabled={clips.length === 0 && !showInviteCards}
          onClick={() => {
            if (phase === "intro") {
              setPhase(clips.length ? "clips" : "end");
              setElapsed(0);
              setPlaying(true);
            } else if (phase === "clips") {
              if (activeIndex >= clips.length - 1) {
                if (showInviteCards) {
                  setPhase("end");
                  setElapsed(0);
                } else goToClip(0);
              } else goToClip(activeIndex + 1);
              setPlaying(true);
            }
          }}
          aria-label="Next"
        >
          ›
        </button>
        {!fullscreen ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={clips.length === 0 && !showInviteCards}
            onClick={() => void enterFullscreen()}
          >
            Fullscreen
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => void exitFullscreen()}>
            Exit
          </button>
        )}
        <span className="muted" style={{ fontSize: "0.85rem", fontVariantNumeric: "tabular-nums" }}>
          {formatTime(trackElapsed)} / {formatTime(totalDuration)}
        </span>
      </div>
    </div>
  );
}
