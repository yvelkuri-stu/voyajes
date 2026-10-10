import { AnimatedLayer } from "./editor/AnimatedLayer";
import { computeLayout, themeLayer, transitionEasingInto } from "../lib/timelineRender";
import { clampSpeed, duckWindows, effectiveAudioClips, sourceTimeAt } from "@voyajes/core";
import { TimelineAudioPlayer } from "../lib/timelineAudio";
import { resolveAudioRef } from "../lib/audioRefs";
import { getLibraryItem, libraryAssetUrl } from "../data/library";
import { easingCss, gradeFilter, type ClipAnimation } from "@voyajes/core";
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
import { getBlob, soundBlobKey, transitionIntoClip, type DraftClipMeta } from "../lib/draftStore";
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
  /** Autoplay-safe: start muted; user can unmute (browser policies). */
  const [soundOn, setSoundOn] = useState(false);
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
        // Portable packs carry media in the URL hash — prefer portableUrl (no IndexedDB).
        if (meta.portableUrl) {
          live.push({ ...meta, objectUrl: meta.portableUrl });
          continue;
        }
        const blob = await getBlob(meta.id);
        if (cancelled) return;
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          objectUrlsRef.current.add(objectUrl);
          live.push({ ...meta, objectUrl });
        } else if (meta.libraryId) {
          // Template/library media travels by id — load from the app's library
          const item = getLibraryItem(meta.libraryId);
          if (item) live.push({ ...meta, objectUrl: libraryAssetUrl(item.url) });
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
      // Only revoke blob: URLs we created from IndexedDB — not portable pack URLs
      // (those are owned by Share.tsx hydration).
      for (const u of objectUrlsRef.current) URL.revokeObjectURL(u);
      objectUrlsRef.current.clear();
    };
  }, [playback, autoPlay, clearAdvanceTimer, showInviteCards]);

  const active = phase === "clips" ? clips[activeIndex] : undefined;
  const globalTransition: TransitionKind =
    playback?.transitionOverride ?? theme.transition;
  const activeTransition = transitionIntoClip(clips, activeIndex, globalTransition);
  const transitionClass = `tx-${activeTransition}`;
  const layer = themeLayer(theme);
  const effAnim = playback?.defaultAnimation ?? layer.animation;
  const shareGrade = gradeFilter(playback?.grade ?? layer.grade);
  const animFor = (c: { kind: "image" | "video"; animation?: ClipAnimation }) =>
    c.animation ?? (c.kind === "image" ? effAnim : { ...effAnim, emphasis: undefined });
  const tlLayout = useMemo(
    () => computeLayout(clips, globalTransition, playback?.transitionSpec, theme),
    [clips, globalTransition, playback?.transitionSpec, theme],
  );
  const txSec = activeIndex > 0 ? Math.max(0.05, tlLayout.tx[activeIndex - 1] ?? 0) : 0.4;
  // Outgoing clip stays underneath during the overlap (true crossfade)
  const [underIdx, setUnderIdx] = useState(-1);
  useEffect(() => {
    if (underIdx < 0) return;
    const ms = (tlLayout.tx[underIdx] ?? 0) * 1000 + 60;
    const t = window.setTimeout(() => setUnderIdx(-1), ms);
    return () => window.clearTimeout(t);
  }, [underIdx, tlLayout]);
  const under = phase === "clips" && underIdx >= 0 && underIdx === activeIndex - 1 ? clips[underIdx] : undefined;
  const txEase = transitionEasingInto(clips, activeIndex, playback?.transitionSpec);

  // Ken Burns comes from the theme-layer animation (AnimatedLayer)
  const kenBurns = "";
  const clipsDuration = tlLayout.total;
  const totalDuration =
    clipsDuration +
    (showInviteCards ? INTRO_SEC + END_SEC : 0);

  const trackElapsed = useMemo(() => {
    if (phase === "intro") return elapsed;
    if (phase === "end") {
      return (showInviteCards ? INTRO_SEC : 0) + clipsDuration + elapsed;
    }
    const before = (showInviteCards ? INTRO_SEC : 0) + (tlLayout.starts[activeIndex] ?? 0);
    return before + elapsed;
  }, [phase, activeIndex, elapsed, clipsDuration, showInviteCards, tlLayout]);

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
    const hold =
      activeIndex < clips.length - 1 ? clip.durationSec - (tlLayout.tx[activeIndex] ?? 0) : clip.durationSec;
    const remaining = Math.max(0.05, hold - elapsed) * 1000;
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
      if ((tlLayout.tx[activeIndex] ?? 0) > 0) setUnderIdx(activeIndex);
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

  // Video element play/pause — muted-first so autoplay policies allow start
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active || active.kind !== "video") return;
    if (playing) {
      // Always mute the element for autoplay; clip mute OR !soundOn keeps it silent
      v.muted = true;
      void v.play().catch(() => {
        /* autoplay blocked — controls remain */
      });
    } else {
      v.pause();
    }
  }, [playing, active, activeIndex, transitionKey, soundOn]);

  // Multi-clip audio track (clips · trims · fades · volume · ducking) — only
  // after unmute (autoplay policy). Same scheduler + envelope as the editor.
  const [localSoundUrls, setLocalSoundUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    // Host's own device: custom sounds live in IndexedDB
    let alive = true;
    const made: string[] = [];
    (async () => {
      const refs = new Set<string>();
      for (const a of playback?.audioClips ?? []) if (a.ref.startsWith("custom:")) refs.add(a.ref);
      if (playback?.audioTrackRef?.startsWith("custom:")) refs.add(playback.audioTrackRef);
      const out: Record<string, string> = {};
      for (const ref of refs) {
        if (playback?.audioUrls?.[ref]) continue;
        const blob = await getBlob(soundBlobKey(ref.slice(7)));
        if (blob) {
          const u = URL.createObjectURL(blob);
          made.push(u);
          out[ref] = u;
        }
      }
      if (alive) setLocalSoundUrls(out);
    })();
    return () => {
      alive = false;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [playback]);

  const shareAudio = useMemo(() => {
    if (!playback) return [];
    const urls = { ...localSoundUrls, ...(playback.audioUrls ?? {}) };
    return effectiveAudioClips(
      {
        track: playback.audioTrackRef,
        ducking: playback.ducking,
        mixMode: playback.audioClips ? undefined : undefined,
        clips: playback.audioClips,
      },
      tlLayout.total,
    ).map((a) => ({ ...a, url: resolveAudioRef(a.ref, urls) }));
  }, [playback, localSoundUrls, tlLayout.total]);
  const shareDucks = useMemo(
    () => ((playback?.autoDuck ?? playback?.ducking !== false) ? duckWindows(clips, tlLayout) : []),
    [playback, clips, tlLayout],
  );
  const audioPlayerRef = useRef<TimelineAudioPlayer | null>(null);
  const audioSync = useRef<{ startedAt: number; offset: number } | null>(null);
  const clipTime = (tlLayout.starts[activeIndex] ?? 0) + elapsed;
  const clipTimeRef = useRef(0);
  // Intro card is pre-roll: timeline audio is scheduled to land on clip 0
  clipTimeRef.current = phase === "intro" && showInviteCards ? elapsed - INTRO_SEC : clipTime;
  const audioPhase = phase === "clips" || (phase === "intro" && showInviteCards);
  const shareAudioRef = useRef(shareAudio);
  shareAudioRef.current = shareAudio;
  const shareDucksRef = useRef(shareDucks);
  shareDucksRef.current = shareDucks;
  const audioKey = JSON.stringify([shareAudio, shareDucks]);
  const startShareAudio = useCallback((from: number) => {
    if (!audioPlayerRef.current) audioPlayerRef.current = new TimelineAudioPlayer();
    audioSync.current = { startedAt: performance.now(), offset: from };
    void audioPlayerRef.current.play(shareAudioRef.current, from, shareDucksRef.current, 0.3);
  }, []);
  useEffect(() => {
    previewHandle.current?.stop();
    previewHandle.current = null;
    if (!playing || !playback || !soundOn || !audioPhase || shareAudio.length === 0) {
      audioPlayerRef.current?.stop();
      audioSync.current = null;
      return;
    }
    startShareAudio(clipTimeRef.current);
    return () => {
      audioPlayerRef.current?.stop();
      audioSync.current = null;
    };
  }, [playing, playback, audioPhase, soundOn, startShareAudio, audioKey]);
  // Re-sync after manual skips / loops (drift > 0.4s)
  useEffect(() => {
    const s0 = audioSync.current;
    if (!s0 || !playing || !soundOn || phase !== "clips") return;
    const expected = tlLayout.starts[activeIndex] ?? 0;
    const actual = s0.offset + (performance.now() - s0.startedAt) / 1000;
    if (Math.abs(actual - expected) > 0.4) startShareAudio(expected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, transitionKey]);
  useEffect(() => () => audioPlayerRef.current?.stop(), []);

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
            <>
            {under && (
              <div key={`under-${under.id}`} className="preview-media preview-media-under">
                <AnimatedLayer
                  animation={animFor(under)}
                  keyframes={under.keyframes}
                  durationSec={under.durationSec}
                  localSec={Math.max(0, under.durationSec - (tlLayout.tx[underIdx] ?? 0))}
                  playing={playing}
                  reverse={under.reverse}
                  resetKey={`under-${under.id}-${transitionKey}`}
                  filter={shareGrade}
                >
                  {under.kind === "image" ? (
                    <img src={under.objectUrl} alt="" draggable={false} />
                  ) : (
                    <video
                      src={under.objectUrl}
                      muted
                      playsInline
                      autoPlay
                      onLoadedMetadata={(e) => {
                        e.currentTarget.playbackRate = clampSpeed(under.speed);
                        e.currentTarget.currentTime = sourceTimeAt(under, under.durationSec - (tlLayout.tx[underIdx] ?? 0));
                      }}
                    />
                  )}
                </AnimatedLayer>
              </div>
            )}
            <div
              key={`${active.id}-${transitionKey}`}
              className={`preview-media ${transitionClass} ${kenBurns}`}
              style={
                {
                  "--tx-ms": `${Math.round(txSec * 1000)}ms`,
                  "--tx-ease": txEase
                    ? easingCss(txEase)
                    : theme.motion === "snappy"
                      ? "var(--motion-snappy)"
                      : theme.motion === "float" || theme.motion === "cinematic"
                        ? "var(--motion-float)"
                        : "var(--motion-soft)",
                } as CSSProperties
              }
            >
              <AnimatedLayer
                animation={animFor(active)}
                keyframes={active.keyframes}
                durationSec={active.durationSec}
                localSec={0}
                playing={playing}
                reverse={active.reverse}
                resetKey={`${active.id}-${transitionKey}`}
                filter={shareGrade}
              >
                {active.kind === "image" ? (
                  <img src={active.objectUrl} alt="" draggable={false} />
                ) : (
                  <video
                    ref={videoRef}
                    src={active.objectUrl}
                    muted
                    playsInline
                    loop={false}
                    onLoadedMetadata={(e) => {
                      e.currentTarget.playbackRate = clampSpeed(active.speed);
                      if (active.inSec) e.currentTarget.currentTime = active.inSec;
                    }}
                  />
                )}
              </AnimatedLayer>
            </div>
            </>
          ) : (
            <div className="preview-empty">
              <div className="display" style={{ fontSize: "1.1rem" }}>
                {mediaMissing ? "Media not on this device" : "No clips yet"}
              </div>
              <div className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                {mediaMissing
                  ? "This link has no embedded media. Ask the host to copy the link again from Share (new links embed photos)."
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
              <img
                src={assetUrl("/brand/logo-app.png") ?? "/brand/logo-app.png"}
                alt=""
                width={28}
                height={28}
                draggable={false}
              />
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
          className={`btn btn-ghost${soundOn ? "" : " is-attn"}`}
          style={{ padding: "8px 14px", minWidth: 108 }}
          disabled={clips.length === 0 && !showInviteCards}
          aria-pressed={soundOn}
          title={soundOn ? "Mute soundtrack" : "Unmute soundtrack (required after autoplay)"}
          onClick={() => {
            setSoundOn((on) => {
              const next = !on;
              if (next && !playing) startPlayback();
              return next;
            });
          }}
        >
          {soundOn ? "Mute" : "Unmute"}
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
