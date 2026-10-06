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
import { textStyleLabel } from "../data/templates";
import { assetUrl } from "../lib/assetUrl";
import { startBeatPreview, type PreviewHandle } from "../lib/beatPreview";
import { getBlob, transitionIntoClip, type DraftClipMeta } from "../lib/draftStore";
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

type Props = {
  record: ShareRecord;
  /** Auto-start when mounts (e.g. after tapping Play). */
  autoPlay?: boolean;
  onCloseFullscreen?: () => void;
};

/**
 * Guest-facing animated playback that mirrors Create preview:
 * same theme grade, transitions, text styles, and catalog beat.
 * Media resolves from IndexedDB clip ids stored on the share snapshot.
 */
export function InvitePlayer({ record, autoPlay = false, onCloseFullscreen }: Props) {
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
  const [playing, setPlaying] = useState(autoPlay);
  const [elapsed, setElapsed] = useState(0);
  const [transitionKey, setTransitionKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [mediaMissing, setMediaMissing] = useState(false);

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
      if (autoPlay && live.length > 0) setPlaying(true);
    })();
    return () => {
      cancelled = true;
      clearAdvanceTimer();
      previewHandle.current?.stop();
      previewHandle.current = null;
      for (const u of objectUrlsRef.current) URL.revokeObjectURL(u);
      objectUrlsRef.current.clear();
    };
  }, [playback, autoPlay, clearAdvanceTimer]);

  const active = clips[activeIndex];
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

  const totalDuration = useMemo(
    () => clips.reduce((sum, c) => sum + c.durationSec, 0),
    [clips],
  );
  const trackElapsed = useMemo(() => {
    let before = 0;
    for (let i = 0; i < activeIndex && i < clips.length; i++) {
      before += clips[i].durationSec;
    }
    return before + elapsed;
  }, [activeIndex, clips, elapsed]);

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

  // Clip advance while playing
  useEffect(() => {
    clearAdvanceTimer();
    if (!playing || clips.length === 0) return;
    const clip = clips[activeIndex];
    if (!clip) return;
    const remaining = Math.max(0.05, clip.durationSec - elapsed) * 1000;
    advanceTimer.current = window.setTimeout(() => {
      if (activeIndex >= clips.length - 1) {
        setPlaying(false);
        setElapsed(0);
        goToClip(0);
        return;
      }
      setElapsed(0);
      goToClip(activeIndex + 1);
    }, remaining);
    return clearAdvanceTimer;
  }, [playing, activeIndex, clips, elapsed, clearAdvanceTimer, goToClip]);

  // Video element play/pause
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active || active.kind !== "video") return;
    if (playing) {
      void v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }, [playing, active, activeIndex, transitionKey]);

  // Beat audio alongside slideshow
  useEffect(() => {
    previewHandle.current?.stop();
    previewHandle.current = null;
    if (!playing || !playback) return;
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
  }, [playing, playback]);

  const textStyle = playback?.textStyle ?? "clean-sans";
  const textTransition = playback?.textTransition ?? "fade";
  const captionStyle = playback?.captionStyle ?? "caption-pill";
  const captionText = playback?.captionText ?? "";
  const overlays = playback?.textOverlays ?? [];
  const title = record.title;
  const aspect = playback?.aspect ?? "9:16";

  const activeOverlays = overlays.filter((o) => {
    const t = trackElapsed;
    return o.value.trim() && t >= o.at && t < o.end;
  });

  const enterFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else setFullscreen(true);
      setFullscreen(true);
      setPlaying(true);
    } catch {
      setFullscreen(true);
      setPlaying(true);
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

  return (
    <div className="invite-player-root">
      <div
        ref={wrapRef}
        className={`invite-player-wrap${fullscreen ? " is-fullscreen" : ""}`}
      >
        <div
          className="preview-stage"
          style={{
            aspectRatio: aspectCss(aspect),
            width:
              aspect === "9:16" || aspect === "4:5"
                ? "min(100%, 360px)"
                : "100%",
            maxHeight:
              aspect === "9:16" || aspect === "4:5" ? "70vh" : 420,
            margin: fullscreen ? "0 auto" : undefined,
          }}
        >
          {active ? (
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

          {!activeOverlays.some((o) => o.role === "title") && (
            <div
              className={`preview-title text-style-${textStyle} text-tx-${textTransition}`}
              style={{ color: theme.palette.text }}
            >
              {title}
              <div className={`preview-sub text-style-${captionStyle}`}>
                {captionText.trim()
                  ? captionText
                  : `${activeTransition} · ${theme.motion} · ${textStyleLabel(textStyle)}${
                      active ? ` · ${activeIndex + 1}/${clips.length}` : ""
                    }`}
              </div>
            </div>
          )}
          {activeOverlays.map((o) => (
            <div
              key={o.id}
              className={`preview-overlay text-style-${o.style} text-tx-${o.animationIn} overlay-pos-${o.position}`}
              style={{ color: o.color || theme.palette.text }}
            >
              {o.value}
            </div>
          ))}
          {(playback?.watermark ?? false) && (
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
          disabled={clips.length === 0}
          onClick={() => goToClip(activeIndex - 1)}
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "8px 20px", minWidth: 96 }}
          disabled={clips.length === 0}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "8px 16px" }}
          disabled={clips.length === 0}
          onClick={() => goToClip(activeIndex + 1)}
          aria-label="Next"
        >
          ›
        </button>
        {!fullscreen ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={clips.length === 0}
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
