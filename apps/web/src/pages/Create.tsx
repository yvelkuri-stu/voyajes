import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  packRef,
  textStyleLabel,
  textTransitionLabel,
  TEXT_STYLE_KINDS,
  TEXT_TRANSITION_KINDS,
  type Aspect,
  type BeatSync,
  type DurationTarget,
  type ExportDestination,
  type TextStyle,
  type TextTransition,
  type TransitionKind,
} from "@voyajes/core";
import {
  getBeats,
  getBeatByRef,
  getBeatById,
  licenseHint,
  licenseLabel,
  type BeatCard,
} from "../data/beats";
import {
  getThemes,
  getThemeById,
  getTransitionKinds,
  transitionLabel,
  type ThemeCard,
} from "../data/themes";
import { getTemplateById, getTemplates, type TemplateCard } from "../data/templates";
import {
  EXPORT_PRESETS,
  exportFilename,
  getExportPreset,
  cliFlagsForPreset,
} from "../data/exportPresets";
import { startBeatPreview, type PreviewHandle } from "../lib/beatPreview";
import { describeBeatSync, snapDurationToBeat } from "../lib/beatSync";
import {
  clearAllBlobs,
  clearDraft,
  clipKindFromMime,
  defaultDraft,
  defaultImageDuration,
  deleteBlob,
  getBlob,
  loadDraft,
  newClipId,
  putBlob,
  readVideoDuration,
  saveDraft,
  toVoyajesProject,
  validatePersistedProject,
  type DraftClipMeta,
  type DraftState,
} from "../lib/draftStore";
import { ensureShareFromDraft } from "../lib/shareStore";
import {
  downloadBlob,
  exportSlideshowWebm,
  type ExportProgress,
} from "../lib/exportWebm";

type LiveClip = DraftClipMeta & { objectUrl: string };

const ASPECTS: Aspect[] = ["9:16", "16:9", "1:1", "4:5"];
const BEAT_SYNC_MODES: BeatSync[] = ["off", "soft", "medium", "hard"];
const TRANSITIONS: TransitionKind[] = getTransitionKinds();
const DURATION_TARGETS: DurationTarget[] = [15, 30, 60];

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function aspectCss(aspect: Aspect): string {
  if (aspect === "16:9") return "16 / 9";
  if (aspect === "1:1") return "1 / 1";
  if (aspect === "4:5") return "4 / 5";
  return "9 / 16";
}

export function Create() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const themes = getThemes();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const advanceTimer = useRef<number | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const paramTemplate = getTemplateById(params.get("template") ?? "");
  const paramTheme =
    getThemeById(params.get("theme") ?? "") ??
    (paramTemplate ? getThemeById(paramTemplate.themeId) : undefined) ??
    themes.find((t) => t.id === "theme.ocean-pop") ??
    themes[0];

  const templates = useMemo(() => getTemplates(), []);
  const beats = useMemo(() => getBeats(), []);
  const previewHandle = useRef<PreviewHandle | null>(null);
  const audioPanelRef = useRef<HTMLElement>(null);

  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState("Untitled voyage");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [themeId, setThemeId] = useState(paramTheme.id);
  const [templateId, setTemplateId] = useState<string | undefined>(
    paramTemplate?.id,
  );
  const [transitionOverride, setTransitionOverride] = useState<TransitionKind | null>(null);
  const [audioTrackRef, setAudioTrackRef] = useState(
    paramTemplate
      ? (getBeatById(paramTemplate.beatId)?.packRef ?? "audio.ocean-drift-084@1.0.0")
      : "audio.ocean-drift-084@1.0.0",
  );
  const [beatSync, setBeatSync] = useState<BeatSync>(
    paramTemplate?.beatSync ?? "medium",
  );
  const [ducking, setDucking] = useState(true);
  const [textStyle, setTextStyle] = useState<TextStyle>(
    paramTemplate?.textStyle ?? "clean-sans",
  );
  const [textTransition, setTextTransition] = useState<TextTransition>(
    paramTemplate?.textTransition ?? "fade",
  );
  const [captionStyle, setCaptionStyle] = useState<TextStyle>("caption-pill");
  const [watermark, setWatermark] = useState(false);
  const [durationTargetSec, setDurationTargetSec] = useState<
    DurationTarget | undefined
  >(paramTemplate?.durationTargetSec);
  const [exportDestination, setExportDestination] =
    useState<ExportDestination>("custom");
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [shareId, setShareId] = useState<string | undefined>(undefined);
  const [sharePassword, setSharePassword] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"file" | "metronome" | null>(
    null,
  );
  const [clips, setClips] = useState<LiveClip[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [transitionKey, setTransitionKey] = useState(0);
  const [schemaOk, setSchemaOk] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(
    null,
  );
  const exportAbortRef = useRef<AbortController | null>(null);

  const theme: ThemeCard = useMemo(
    () => getThemeById(themeId) ?? themes[0],
    [themeId, themes],
  );

  const activeTransition: TransitionKind =
    transitionOverride ?? theme.transition;

  const selectedBeat: BeatCard =
    getBeatByRef(audioTrackRef) ?? beats[0] ?? {
      id: "audio.ocean-drift-084",
      kind: "audio-beat" as const,
      version: "1.0.0",
      name: "Ocean Drift",
      bpm: 84,
      mood: ["calm", "ocean"],
      license: "personal" as const,
      tier: "free" as const,
      packRef: "audio.ocean-drift-084@1.0.0",
    };

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

  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }, []);

  const trackUrl = useCallback((url: string) => {
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  // Hydrate from localStorage + IndexedDB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = loadDraft();
      const base = draft ?? defaultDraft(paramTheme.id);
      if (!draft && params.get("theme")) {
        base.themeId = paramTheme.id;
        base.themeVersion = paramTheme.version;
      }
      if (params.get("template") && paramTemplate) {
        base.themeId = paramTemplate.themeId;
        base.themeVersion = getThemeById(paramTemplate.themeId)?.version ?? "1.0.0";
        base.templateId = paramTemplate.id;
        base.templateVersion = paramTemplate.version;
        base.audioTrackRef =
          getBeatById(paramTemplate.beatId)?.packRef ?? base.audioTrackRef;
        base.beatSync = paramTemplate.beatSync;
        base.textStyle = paramTemplate.textStyle;
        base.textTransition = paramTemplate.textTransition;
        if (paramTemplate.aspect) base.aspect = paramTemplate.aspect;
        if (paramTemplate.durationTargetSec) {
          base.durationTargetSec = paramTemplate.durationTargetSec;
        }
      }
      if (cancelled) return;
      setTitle(base.title);
      setAspect(base.aspect);
      setThemeId(base.themeId);
      setTemplateId(base.templateId);
      setAudioTrackRef(base.audioTrackRef);
      setBeatSync(base.beatSync);
      setDucking(base.ducking);
      setTextStyle(base.textStyle);
      setTextTransition(base.textTransition);
      setCaptionStyle(base.captionStyle);
      setWatermark(base.watermark);
      setDurationTargetSec(base.durationTargetSec);
      setExportDestination(base.exportDestination);
      setShareId(base.shareId);
      setSharePassword(base.sharePassword === true);
      if (paramTemplate) {
        setTransitionOverride(paramTemplate.transition);
      }
      const live: LiveClip[] = [];
      for (const meta of base.clips) {
        const blob = await getBlob(meta.id);
        if (cancelled) return;
        if (blob) {
          const objectUrl = trackUrl(URL.createObjectURL(blob));
          live.push({ ...meta, objectUrl });
        }
      }
      setClips(live);
      setHydrated(true);
      setSchemaOk(validatePersistedProject().ok || live.length === 0);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft whenever project fields change
  useEffect(() => {
    if (!hydrated) return;
    const draft: DraftState = {
      title,
      aspect,
      themeId,
      themeVersion: theme.version,
      templateId,
      templateVersion: templateId
        ? getTemplateById(templateId)?.version
        : undefined,
      audioTrackRef,
      beatSync,
      ducking,
      textStyle,
      textTransition,
      captionStyle,
      watermark,
      durationTargetSec,
      exportDestination,
      shareId,
      sharePassword,
      clips: clips.map(
        ({ id, fileName, mimeType, kind, durationSec, mute }): DraftClipMeta => ({
          id,
          fileName,
          mimeType,
          kind,
          durationSec,
          mute,
        }),
      ),
      updatedAt: new Date().toISOString(),
    };
    saveDraft(draft);
    setSchemaOk(validatePersistedProject().ok);
  }, [
    hydrated,
    title,
    aspect,
    themeId,
    theme.version,
    templateId,
    audioTrackRef,
    beatSync,
    ducking,
    textStyle,
    textTransition,
    captionStyle,
    watermark,
    durationTargetSec,
    exportDestination,
    shareId,
    sharePassword,
    clips,
  ]);

  // Cleanup object URLs + audio preview on unmount
  useEffect(() => {
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      previewHandle.current?.stop();
      previewHandle.current = null;
      exportAbortRef.current?.abort();
      exportAbortRef.current = null;
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      objectUrlsRef.current.clear();
    };
  }, []);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimer.current) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  const goToClip = useCallback(
    (index: number, withTransition = true) => {
      if (clips.length === 0) return;
      const next = ((index % clips.length) + clips.length) % clips.length;
      setActiveIndex(next);
      setElapsed(0);
      if (withTransition) setTransitionKey((k) => k + 1);
    },
    [clips.length],
  );

  // Slideshow auto-advance
  useEffect(() => {
    clearAdvanceTimer();
    if (!playing || clips.length === 0) return;

    const clip = clips[activeIndex];
    if (!clip) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const holdMs = Math.max(400, clip.durationSec * 1000);
    const tickStart = performance.now();

    const tick = () => {
      const t = (performance.now() - tickStart) / 1000;
      setElapsed(Math.min(t, clip.durationSec));
      if (t < clip.durationSec) {
        advanceTimer.current = window.setTimeout(tick, 50);
      } else {
        const next = (activeIndex + 1) % clips.length;
        goToClip(next, !reduced);
      }
    };
    advanceTimer.current = window.setTimeout(tick, 50);

    return clearAdvanceTimer;
  }, [playing, activeIndex, clips, clearAdvanceTimer, goToClip]);

  // Drive video element when active clip is video
  useEffect(() => {
    const clip = clips[activeIndex];
    const el = videoRef.current;
    if (!clip || clip.kind !== "video" || !el) return;
    el.currentTime = 0;
    if (playing) {
      void el.play().catch(() => {
        /* autoplay may fail without gesture; Play button covers it */
      });
    } else {
      el.pause();
    }
  }, [playing, activeIndex, clips]);

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const added: LiveClip[] = [];
      const skipped: string[] = [];

      for (const file of list) {
        const kind = clipKindFromMime(file.type, file.name);
        if (!kind) {
          skipped.push(file.name);
          continue;
        }
        if (clips.length + added.length >= 40) {
          skipped.push(`${file.name} (limit 40)`);
          continue;
        }
        const id = newClipId();
        let durationSec =
          kind === "video"
            ? await readVideoDuration(file)
            : defaultImageDuration(theme.motion);
        if (kind === "image" && beatSync !== "off") {
          const bpm = getBeatByRef(audioTrackRef)?.bpm ?? selectedBeat.bpm;
          durationSec = snapDurationToBeat(durationSec, bpm, beatSync);
        }
        await putBlob(id, file);
        const objectUrl = trackUrl(URL.createObjectURL(file));
        added.push({
          id,
          fileName: file.name,
          mimeType: file.type || (kind === "image" ? "image/jpeg" : "video/mp4"),
          kind,
          durationSec,
          mute: true,
          objectUrl,
        });
      }

      if (added.length) {
        setClips((prev) => {
          const next = [...prev, ...added];
          if (prev.length === 0) setActiveIndex(0);
          return next;
        });
        setStatus(
          `Imported ${added.length} clip${added.length === 1 ? "" : "s"}${
            skipped.length ? ` · skipped ${skipped.length}` : ""
          }`,
        );
      } else if (skipped.length) {
        setStatus(`Could not import: ${skipped.join(", ")}`);
      }
    },
    [clips.length, theme.motion, trackUrl, beatSync, audioTrackRef, selectedBeat.bpm],
  );

  const stopPreview = useCallback(() => {
    previewHandle.current?.stop();
    previewHandle.current = null;
    setPreviewingId(null);
    setPreviewMode(null);
  }, []);

  const applyBeatSnap = useCallback(
    (mode: BeatSync, bpm: number, onlyImages = true) => {
      if (mode === "off") return;
      setClips((prev) =>
        prev.map((c) => {
          if (onlyImages && c.kind !== "image") return c;
          return {
            ...c,
            durationSec: snapDurationToBeat(c.durationSec, bpm, mode),
          };
        }),
      );
    },
    [],
  );

  const selectBeat = useCallback(
    (beat: BeatCard) => {
      setAudioTrackRef(beat.packRef);
      if (beatSync !== "off") {
        applyBeatSnap(beatSync, beat.bpm, true);
        setStatus(`Beat · ${beat.name} · holds snapped to ${beatSync}`);
      } else {
        setStatus(`Beat · ${beat.name}`);
      }
    },
    [applyBeatSnap, beatSync],
  );

  const togglePreview = useCallback(
    (beat: BeatCard) => {
      if (previewingId === beat.id) {
        stopPreview();
        return;
      }
      stopPreview();
      previewHandle.current = startBeatPreview({
        previewUrl: beat.previewUrl,
        bpm: beat.bpm,
        mood: beat.mood,
        onMode: (m) => setPreviewMode(m),
        onError: (msg) => setStatus(msg),
      });
      setPreviewingId(beat.id);
    },
    [previewingId, stopPreview],
  );

  const setBeatSyncMode = useCallback(
    (mode: BeatSync) => {
      setBeatSync(mode);
      if (mode !== "off") {
        applyBeatSnap(mode, selectedBeat.bpm, true);
        setStatus(`Beat-sync ${mode} · snapped image holds`);
      } else {
        setStatus("Beat-sync off");
      }
    },
    [applyBeatSnap, selectedBeat.bpm],
  );

  const applyTemplate = useCallback(
    (tpl: TemplateCard) => {
      const th = getThemeById(tpl.themeId);
      const beat = getBeatById(tpl.beatId);
      setTemplateId(tpl.id);
      if (th) setThemeId(th.id);
      setTransitionOverride(tpl.transition);
      if (beat) {
        setAudioTrackRef(beat.packRef);
        if (tpl.beatSync !== "off") {
          applyBeatSnap(tpl.beatSync, beat.bpm, true);
        }
      }
      setBeatSync(tpl.beatSync);
      setTextStyle(tpl.textStyle);
      setTextTransition(tpl.textTransition);
      if (tpl.aspect) setAspect(tpl.aspect);
      if (tpl.durationTargetSec) setDurationTargetSec(tpl.durationTargetSec);
      setTransitionKey((k) => k + 1);
      setStatus(`Template · ${tpl.name} applied`);
    },
    [applyBeatSnap],
  );

  const applyExportDestination = useCallback((dest: ExportDestination) => {
    setExportDestination(dest);
    if (dest === "custom") {
      setStatus("Export · custom aspect");
      return;
    }
    const preset = getExportPreset(dest);
    setAspect(preset.aspect);
    if (preset.durationTargets.length === 1) {
      setDurationTargetSec(preset.durationTargets[0]);
    }
    setStatus(
      `Export · ${preset.label} → ${preset.aspect} · ${preset.filenameSuffix || "custom"}`,
    );
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) {
        void importFiles(e.dataTransfer.files);
      }
    },
    [importFiles],
  );

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void importFiles(e.target.files);
    e.target.value = "";
  };

  const removeClip = async (index: number) => {
    const clip = clips[index];
    if (!clip) return;
    setPlaying(false);
    clearAdvanceTimer();
    revokeUrl(clip.objectUrl);
    await deleteBlob(clip.id);
    setClips((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setActiveIndex((ai) => {
        if (next.length === 0) return 0;
        if (ai > index) return ai - 1;
        if (ai >= next.length) return next.length - 1;
        return ai;
      });
      return next;
    });
    setStatus("Clip removed");
  };

  const moveClip = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= clips.length) return;
    setClips((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    setActiveIndex((ai) => {
      if (ai === index) return target;
      if (ai === target) return index;
      return ai;
    });
  };

  const resetProject = async () => {
    setPlaying(false);
    clearAdvanceTimer();
    for (const c of clips) revokeUrl(c.objectUrl);
    await clearAllBlobs();
    clearDraft();
    const d = defaultDraft(themeId);
    setTitle(d.title);
    setAspect(d.aspect);
    setTemplateId(undefined);
    setTransitionOverride(null);
    setAudioTrackRef(d.audioTrackRef);
    setBeatSync(d.beatSync);
    setDucking(d.ducking);
    setTextStyle(d.textStyle);
    setTextTransition(d.textTransition);
    setCaptionStyle(d.captionStyle);
    setWatermark(false);
    setDurationTargetSec(undefined);
    setExportDestination("custom");
    setShareId(undefined);
    setSharePassword(false);
    stopPreview();
    setClips([]);
    setActiveIndex(0);
    setElapsed(0);
    setStatus("Draft cleared");
  };

  const cancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const exportVideo = async () => {
    if (clips.length === 0 || exporting) return;
    stopPreview();
    setPlaying(false);
    clearAdvanceTimer();

    const ac = new AbortController();
    exportAbortRef.current = ac;
    setExporting(true);
    setExportProgress({
      phase: "prepare",
      ratio: 0,
      clipIndex: 0,
      clipCount: clips.length,
      message: "Preparing export…",
    });
    setStatus("Exporting video…");

    try {
      const preset = getExportPreset(exportDestination);
      const result = await exportSlideshowWebm({
        clips: clips.map((c) => ({
          id: c.id,
          kind: c.kind,
          objectUrl: c.objectUrl,
          fileName: c.fileName,
          durationSec: c.durationSec,
        })),
        theme,
        title,
        aspect,
        transition: activeTransition,
        shortEdge: preset.shortEdge,
        watermark,
        audio: selectedBeat.previewUrl
          ? {
              previewUrl: selectedBeat.previewUrl,
              beatName: selectedBeat.name,
              // Ducking stays mostly metadata; export applies a mild gain trim only
              ducking,
            }
          : undefined,
        onProgress: (p) => {
          setExportProgress(p);
          setStatus(p.message);
        },
        signal: ac.signal,
      });
      const name = exportFilename(title, preset, result.extension);
      downloadBlob(result.blob, name);
      const skipNote =
        result.skippedVideos.length > 0
          ? ` · skipped ${result.skippedVideos.length} video clip(s)`
          : "";
      const audioNote = result.audioMuxed
        ? ` · beat audio (${selectedBeat.name})`
        : result.audioWarning
          ? ` · ${result.audioWarning}`
          : "";
      setStatus(
        `Downloaded ${name} (${Math.round(result.blob.size / 1024)} KB)${skipNote}${audioNote}`,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("Export cancelled");
      } else {
        const msg = err instanceof Error ? err.message : "Export failed";
        setStatus(msg);
      }
    } finally {
      exportAbortRef.current = null;
      setExporting(false);
      setExportProgress(null);
    }
  };

  const downloadProjectJson = () => {
    const draft: DraftState = {
      title,
      aspect,
      themeId,
      themeVersion: theme.version,
      templateId,
      templateVersion: templateId
        ? getTemplateById(templateId)?.version
        : undefined,
      audioTrackRef,
      beatSync,
      ducking,
      textStyle,
      textTransition,
      captionStyle,
      watermark,
      durationTargetSec,
      exportDestination,
      shareId,
      sharePassword,
      clips: clips.map(({ id, fileName, mimeType, kind, durationSec, mute }) => ({
        id,
        fileName,
        mimeType,
        kind,
        durationSec,
        mute,
      })),
      updatedAt: new Date().toISOString(),
    };
    const project = toVoyajesProject(draft);
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "voyajes.project.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus(
      "Downloaded project JSON · browser Export video for WebM; CLI/cloud FFmpeg still TODO",
    );
  };

  const openShare = () => {
    const draft: DraftState = {
      title,
      aspect,
      themeId,
      themeVersion: theme.version,
      templateId,
      templateVersion: templateId
        ? getTemplateById(templateId)?.version
        : undefined,
      audioTrackRef,
      beatSync,
      ducking,
      textStyle,
      textTransition,
      captionStyle,
      watermark,
      durationTargetSec,
      exportDestination,
      shareId,
      sharePassword,
      clips: clips.map(({ id, fileName, mimeType, kind, durationSec, mute }) => ({
        id,
        fileName,
        mimeType,
        kind,
        durationSec,
        mute,
      })),
      updatedAt: new Date().toISOString(),
    };
    const share = ensureShareFromDraft(draft, {
      themeName: theme.name,
      themeAccent: theme.palette.accent,
      themeGradient: theme.gradient,
      audioName: selectedBeat.name,
      audioBpm: selectedBeat.bpm,
    });
    setShareId(share.id);
    saveDraft({ ...draft, shareId: share.id });
    setStatus(`Share ready · ${share.id}`);
    navigate(`/v/${share.id}`);
  };

  const active = clips[activeIndex];
  const transitionClass = `tx-${activeTransition}`;
  const kenBurns =
    active?.kind === "image" && theme.photoMotion !== "off"
      ? theme.photoMotion === "bold"
        ? "ken-bold"
        : "ken-gentle"
      : "";

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 className="display" style={{ margin: 0, fontSize: "1.35rem" }}>
            Compose · Auto
          </h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
            Every voyage, in motion — drop photos or clips, pick a theme, play.
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Project title"
            style={{
              marginTop: 8,
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: "1rem",
              fontFamily: "Sora, sans-serif",
              fontWeight: 600,
              width: "min(100%, 320px)",
              padding: "4px 0",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" onClick={downloadProjectJson}>
            Export JSON
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={exporting}
            title="Choose YouTube / TikTok / Instagram presets, then export WebM"
            onClick={() => setExportPanelOpen((o) => !o)}
            aria-busy={exporting}
          >
            {exporting
              ? `Exporting ${Math.round((exportProgress?.ratio ?? 0) * 100)}%`
              : "Export…"}
          </button>
          {exporting && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={cancelExport}
              title="Cancel browser export"
            >
              Cancel
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={openShare}>
            Share
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <Link to="/themes" className="chip" title="Browse themes">
          <span className="swatch" style={{ background: theme.palette.accent }} />
          Theme {theme.name}
        </Link>
        <Link
          to="/themes?tab=templates"
          className="chip"
          title="Browse templates"
        >
          {templateId
            ? `Template · ${getTemplateById(templateId)?.name ?? "pack"}`
            : "Templates"}
        </Link>
        <button
          type="button"
          className="chip"
          onClick={() =>
            audioPanelRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            })
          }
          title="Open audio panel"
        >
          Audio · {selectedBeat.name}
          <span className={`license-badge license-${selectedBeat.license}`}>
            {licenseLabel(selectedBeat.license)}
          </span>
        </button>
        <button
          type="button"
          className="chip"
          onClick={() =>
            setAspect((a) => {
              const i = ASPECTS.indexOf(a);
              return ASPECTS[(i + 1) % ASPECTS.length];
            })
          }
        >
          {aspect}
        </button>
        <span className="chip" title="Draft persistence">
          Draft {schemaOk ? "✓" : "!"} · {clips.length} clip
          {clips.length === 1 ? "" : "s"}
        </span>
        {status && (
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {status}
          </span>
        )}
      </div>

      {exportPanelOpen && (
        <div className="panel export-panel" style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ margin: 0 }}>Export for social</h3>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "6px 10px" }}
              onClick={() => setExportPanelOpen(false)}
            >
              Close
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 6 }}>
            Pick a destination to set aspect + suggested filename. Browser records
            WebM (VP9/Opus when supported). CLI:{" "}
            <code style={{ fontSize: "0.75rem" }}>
              {cliFlagsForPreset(getExportPreset(exportDestination))}
            </code>
          </p>
          <div className="chip-row" style={{ flexWrap: "wrap", marginTop: 10 }}>
            {EXPORT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip${exportDestination === p.id ? " chip-active" : ""}`}
                title={p.hint}
                onClick={() => applyExportDestination(p.id)}
              >
                {p.label}
                <span className="muted" style={{ marginLeft: 6, fontSize: "0.72rem" }}>
                  {p.aspect}
                </span>
              </button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              marginTop: 14,
              alignItems: "flex-start",
            }}
          >
            <div>
              <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 6 }}>
                Duration target
              </div>
              <div className="chip-row">
                <button
                  type="button"
                  className={`chip${!durationTargetSec ? " chip-active" : ""}`}
                  onClick={() => setDurationTargetSec(undefined)}
                >
                  Off
                </button>
                {DURATION_TARGETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chip${durationTargetSec === d ? " chip-active" : ""}`}
                    onClick={() => {
                      setDurationTargetSec(d);
                      setStatus(
                        totalDuration > d
                          ? `Target ${d}s · timeline is ${totalDuration.toFixed(1)}s (trim holds)`
                          : `Target ${d}s · timeline ${totalDuration.toFixed(1)}s`,
                      );
                    }}
                  >
                    {d}s
                  </button>
                ))}
              </div>
              {durationTargetSec && (
                <p className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
                  Timeline {totalDuration.toFixed(1)}s
                  {totalDuration > durationTargetSec
                    ? " · over target"
                    : totalDuration > 0
                      ? " · within target"
                      : ""}
                </p>
              )}
            </div>
            <label className="toggle-row" style={{ marginTop: 4 }}>
              <input
                type="checkbox"
                checked={watermark}
                onChange={(e) => {
                  setWatermark(e.target.checked);
                  setStatus(
                    e.target.checked
                      ? "Watermark on · Voyajes mark on export (stub)"
                      : "Watermark off",
                  );
                }}
              />
              <span>
                Watermark
                <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                  Soft Voyajes mark · stub for Pro branding later
                </span>
              </span>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={clips.length === 0 || exporting}
              onClick={() => void exportVideo()}
            >
              {exporting
                ? `Recording ${Math.round((exportProgress?.ratio ?? 0) * 100)}%`
                : `Export WebM · ${getExportPreset(exportDestination).label}`}
            </button>
            {exporting && (
              <button type="button" className="btn btn-ghost" onClick={cancelExport}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className="compose-layout">
        <div>
          <div
            className={`dropzone${dragOver ? " drag-over" : ""}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime,.mov,.m4v"
              multiple
              hidden
              onChange={onFileChange}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              Import photos &amp; video
            </button>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              or drag &amp; drop here · JPG, PNG, WebP, MP4, WebM
            </span>
          </div>

          <div
            className="preview-stage"
            style={{
              aspectRatio: aspectCss(aspect),
              width: aspect === "9:16" || aspect === "4:5" ? "min(100%, 360px)" : "100%",
              maxHeight: aspect === "9:16" || aspect === "4:5" ? "70vh" : 420,
              marginTop: 16,
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
                  <img src={active.objectUrl} alt={active.fileName} draggable={false} />
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
                <div className="display" style={{ fontSize: "1.1rem", opacity: 0.9 }}>
                  Your voyage starts here
                </div>
                <div className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                  Import media to preview with {theme.name}
                </div>
              </div>
            )}

            <div
              className="grade"
              style={{
                background: theme.gradient,
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

            <div
              className={`preview-title text-style-${textStyle} text-tx-${textTransition}`}
              style={{ color: theme.palette.text }}
            >
              {title}
              <div className={`preview-sub text-style-${captionStyle}`}>
                {activeTransition} · {theme.motion} · {textStyleLabel(textStyle)}
                {active ? ` · ${activeIndex + 1}/${clips.length}` : ""}
                {durationTargetSec ? ` · target ${durationTargetSec}s` : ""}
              </div>
            </div>
            {watermark && (
              <div className="preview-watermark" aria-hidden>
                Voyajes
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              marginTop: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "8px 16px" }}
              disabled={clips.length === 0}
              onClick={() => goToClip(activeIndex - 1)}
              aria-label="Previous clip"
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
              aria-label="Next clip"
            >
              ›
            </button>
            <span className="muted" style={{ fontSize: "0.85rem", fontVariantNumeric: "tabular-nums" }}>
              {formatTime(trackElapsed)} / {formatTime(totalDuration)}
            </span>
          </div>

          <div className="filmstrip" aria-label="Clip filmstrip">
            {clips.map((c, i) => (
              <div key={c.id} className="film-clip-wrap">
                <button
                  type="button"
                  className={`film-clip${i === activeIndex ? " active" : ""}`}
                  onClick={() => {
                    setPlaying(false);
                    goToClip(i, true);
                  }}
                  style={{
                    backgroundImage: c.kind === "image" ? `url(${c.objectUrl})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderColor:
                      i === activeIndex ? theme.palette.accent : undefined,
                  }}
                  title={c.fileName}
                >
                  {c.kind === "video" && (
                    <video src={c.objectUrl} muted playsInline preload="metadata" />
                  )}
                  <span className="film-clip-label">
                    {c.kind === "video" ? "▶" : i + 1}
                  </span>
                </button>
                <div className="film-clip-actions">
                  <button
                    type="button"
                    aria-label="Move earlier"
                    disabled={i === 0}
                    onClick={() => moveClip(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move later"
                    disabled={i === clips.length - 1}
                    onClick={() => moveClip(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${c.fileName}`}
                    onClick={() => void removeClip(i)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="film-clip film-add"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add clips"
            >
              +
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.8rem", textAlign: "center" }}>
            Draft saves to localStorage (+ media in IndexedDB). Export records browser
            WebM with beat mux when supported. Use Export… for YouTube / TikTok / IG
            presets. Cloud encode still TODO — Export JSON for the CLI.
          </p>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => void resetProject()}>
              Clear draft
            </button>
          </div>
        </div>

        <aside className="panel">
          <h3>Theme panel</h3>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            Live grade, title color, Ken Burns, and transition timing.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setThemeId(t.id);
                  setTransitionOverride(null);
                }}
                className="chip"
                style={{
                  justifyContent: "flex-start",
                  width: "100%",
                  borderColor:
                    themeId === t.id ? t.palette.accent : "var(--border-subtle)",
                  background:
                    themeId === t.id
                      ? `linear-gradient(90deg, ${t.palette.accent}22, transparent)`
                      : undefined,
                }}
              >
                <span className="swatch" style={{ background: t.palette.accent }} />
                {t.name}
                <span className="muted" style={{ marginLeft: "auto", fontSize: "0.75rem" }}>
                  {t.motion}
                </span>
              </button>
            ))}
          </div>

          <div className="muted" style={{ fontSize: "0.8rem", marginTop: 14, marginBottom: 6 }}>
            Templates
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflow: "auto" }}>
            {templates.slice(0, 14).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="chip"
                style={{
                  justifyContent: "flex-start",
                  width: "100%",
                  borderColor:
                    templateId === tpl.id
                      ? tpl.theme?.palette.accent ?? "var(--accent-brand)"
                      : "var(--border-subtle)",
                }}
                onClick={() => applyTemplate(tpl)}
                title={tpl.description}
              >
                {tpl.name}
                <span className="muted" style={{ marginLeft: "auto", fontSize: "0.7rem" }}>
                  {tpl.motion}
                </span>
              </button>
            ))}
          </div>
          <Link
            to="/themes?tab=templates"
            className="muted"
            style={{ fontSize: "0.75rem", display: "inline-block", marginTop: 6 }}
          >
            Browse all templates →
          </Link>

          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--border-subtle)",
              margin: "16px 0",
            }}
          />
          <div style={{ fontSize: "0.8rem" }}>
            <div className="muted">Pack ref (CLI)</div>
            <code style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
              {packRef(theme.id, theme.version)}
            </code>
            <div className="muted" style={{ marginTop: 12 }}>
              Transition
            </div>
            <div className="chip-row" style={{ marginTop: 6, flexWrap: "wrap" }}>
              {TRANSITIONS.filter((k) => k !== "cut").map((kind) => {
                const selected = activeTransition === kind;
                const isDefault = theme.transition === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    className={`chip${selected ? " chip-active" : ""}`}
                    title={
                      isDefault
                        ? `${transitionLabel(kind)} (theme default)`
                        : transitionLabel(kind)
                    }
                    onClick={() => {
                      setTransitionOverride(
                        kind === theme.transition ? null : kind,
                      );
                      setTransitionKey((k) => k + 1);
                      setStatus(
                        kind === theme.transition
                          ? `Transition · ${transitionLabel(kind)} (theme default)`
                          : `Transition · ${transitionLabel(kind)}`,
                      );
                    }}
                  >
                    {transitionLabel(kind)}
                    {isDefault ? " ★" : ""}
                  </button>
                );
              })}
            </div>
            <div className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
              {activeTransition} · {theme.transitionDurationMs}ms
              {transitionOverride && transitionOverride !== theme.transition
                ? " · override"
                : " · theme default"}
            </div>
            {theme.suggestedBeatIds && theme.suggestedBeatIds.length > 0 && (
              <>
                <div className="muted" style={{ marginTop: 12 }}>
                  Suggested beats
                </div>
                <div className="chip-row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                  {theme.suggestedBeatIds.map((id) => {
                    const beat = beats.find((b) => b.id === id);
                    if (!beat) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`chip${selectedBeat.id === id ? " chip-active" : ""}`}
                        onClick={() => selectBeat(beat)}
                      >
                        {beat.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {active && (
              <>
                <div className="muted" style={{ marginTop: 12 }}>
                  Active clip
                </div>
                <div style={{ wordBreak: "break-all" }}>{active.fileName}</div>
                <label
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginTop: 8,
                    fontSize: "0.85rem",
                  }}
                >
                  Hold (sec)
                  <input
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.1}
                    value={active.durationSec}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      setClips((prev) =>
                        prev.map((c, i) =>
                          i === activeIndex
                            ? { ...c, durationSec: Math.min(30, Math.max(0.5, v)) }
                            : c,
                        ),
                      );
                    }}
                    style={{
                      width: 72,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 8,
                      color: "var(--text-primary)",
                      padding: "4px 8px",
                    }}
                  />
                </label>
              </>
            )}
          </div>

          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--border-subtle)",
              margin: "20px 0 16px",
            }}
          />

          <section aria-label="Text & captions">
            <h3 style={{ marginBottom: 4 }}>Text &amp; captions</h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              Title style, entrance, and caption preset (original Voyajes packs).
            </p>
            <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 6 }}>
              Title style
            </div>
            <div className="chip-row" style={{ flexWrap: "wrap" }}>
              {TEXT_STYLE_KINDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip${textStyle === s ? " chip-active" : ""}`}
                  onClick={() => {
                    setTextStyle(s);
                    setStatus(`Text style · ${textStyleLabel(s)}`);
                  }}
                >
                  {textStyleLabel(s)}
                </button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: "0.8rem", margin: "12px 0 6px" }}>
              Text transition
            </div>
            <div className="chip-row" style={{ flexWrap: "wrap" }}>
              {TEXT_TRANSITION_KINDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip${textTransition === s ? " chip-active" : ""}`}
                  onClick={() => {
                    setTextTransition(s);
                    setStatus(`Text transition · ${textTransitionLabel(s)}`);
                  }}
                >
                  {textTransitionLabel(s)}
                </button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: "0.8rem", margin: "12px 0 6px" }}>
              Caption style
            </div>
            <div className="chip-row" style={{ flexWrap: "wrap" }}>
              {(["caption-pill", "clean-sans", "bold-impact", "kinetic-outline"] as TextStyle[]).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    className={`chip${captionStyle === s ? " chip-active" : ""}`}
                    onClick={() => {
                      setCaptionStyle(s);
                      setStatus(`Caption · ${textStyleLabel(s)}`);
                    }}
                  >
                    {textStyleLabel(s)}
                  </button>
                ),
              )}
            </div>
          </section>

          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--border-subtle)",
              margin: "20px 0 16px",
            }}
          />

          <section ref={audioPanelRef} className="audio-panel" aria-label="Audio">
            <h3 style={{ marginBottom: 4 }}>Audio panel</h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              Catalog beats · preview · beat-sync · ducking (mild gain on export; true dialogue duck TODO).
            </p>

            <div className="beat-list">
              {beats.map((beat) => {
                const selected = selectedBeat.id === beat.id;
                const playing = previewingId === beat.id;
                return (
                  <div
                    key={beat.id}
                    className={`beat-row${selected ? " selected" : ""}`}
                    style={
                      selected
                        ? {
                            borderColor: theme.palette.accent,
                            background: `linear-gradient(90deg, ${theme.palette.accent}18, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      className="beat-select"
                      onClick={() => selectBeat(beat)}
                    >
                      <span className="beat-name">{beat.name}</span>
                      <span className="muted beat-meta">
                        {beat.bpm} BPM · {beat.mood.join(" · ")}
                        {beat.tier !== "free" ? ` · ${beat.tier}` : ""}
                      </span>
                      <span className={`license-badge license-${beat.license}`}>
                        {licenseLabel(beat.license)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`btn btn-ghost beat-play${playing ? " is-playing" : ""}`}
                      aria-label={playing ? `Stop ${beat.name}` : `Preview ${beat.name}`}
                      onClick={() => togglePreview(beat)}
                    >
                      {playing ? "Stop" : "▶"}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="muted" style={{ fontSize: "0.75rem", marginTop: 10 }}>
              {licenseHint(selectedBeat.license)}
              {previewMode === "metronome"
                ? " · Preview via BPM metronome"
                : previewMode === "file"
                  ? " · Playing catalog preview"
                  : ""}
            </p>

            <div className="audio-toggles">
              <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 6 }}>
                Beat-sync
              </div>
              <div className="chip-row">
                {BEAT_SYNC_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`chip${beatSync === mode ? " chip-active" : ""}`}
                    onClick={() => setBeatSyncMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: "0.75rem", marginTop: 8 }}>
                {describeBeatSync(beatSync, selectedBeat.bpm)}
              </p>

              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={ducking}
                  onChange={(e) => {
                    setDucking(e.target.checked);
                    setStatus(
                      e.target.checked
                        ? "Ducking on · will lower music under VO on export"
                        : "Ducking off",
                    );
                  }}
                />
                <span>
                  Ducking
                  <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                    Stored in project JSON · applied at export
                  </span>
                </span>
              </label>

              <div className="muted" style={{ fontSize: "0.75rem", marginTop: 12 }}>
                Track ref
              </div>
              <code style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>
                {selectedBeat.packRef}
              </code>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
