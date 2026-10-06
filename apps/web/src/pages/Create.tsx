import {
  Fragment,
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
import { EmojiPicker } from "../components/EmojiPicker";
import {
  packRef,
  textStyleLabel,
  textTransitionLabel,
  TEXT_STYLE_KINDS,
  TEXT_TRANSITION_KINDS,
  type Aspect,
  type AudioMixMode,
  type BeatSync,
  type CustomSound,
  type DurationTarget,
  type ExportDestination,
  type TextPosition,
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
import { getKidsSafeTemplates, getTemplateById, getTemplates, type TemplateCard } from "../data/templates";
import { usePrefs } from "../hooks/usePrefs";
import {
  STICKER_PACK,
  addMemoryMoment,
  loadMemoryJar,
  removeMemoryMoment,
  suggestStoryCopy,
  type MemoryMoment,
  KIDS_SAFE_THEME_IDS,
} from "../lib/prefsStore";
import {
  EXPORT_PRESETS,
  exportFilename,
  getExportPreset,
  cliFlagsForPreset,
} from "../data/exportPresets";
import { startBeatPreview, type PreviewHandle } from "../lib/beatPreview";
import { describeBeatSync, snapDurationToBeat } from "../lib/beatSync";
import {
  audioKindFromMime,
  clearAllBlobs,
  clearDraft,
  clipKindFromMime,
  customIdFromTrackRef,
  defaultDraft,
  defaultImageDuration,
  defaultTextOverlay,
  deleteBlob,
  getBlob,
  isCustomTrackRef,
  loadDraft,
  newClipId,
  newSoundId,
  putBlob,
  readVideoDuration,
  saveDraft,
  soundBlobKey,
  toVoyajesProject,
  transitionIntoClip,
  validatePersistedProject,
  type DraftClipMeta,
  type DraftState,
  type DraftTextOverlay,
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
const TEXT_POSITIONS: TextPosition[] = ["top", "center", "bottom", "lower-third"];
const AUDIO_ACCEPT = "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/ogg,audio/aac,.mp3,.wav,.m4a,.ogg";

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
  const { prefs } = usePrefs();
  const kidsMode = prefs.kidsMode;
  const themes = kidsMode
    ? getThemes().filter((t) =>
        (KIDS_SAFE_THEME_IDS as readonly string[]).includes(t.id),
      )
    : getThemes();
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

  const templates = useMemo(
    () => (kidsMode ? getKidsSafeTemplates() : getTemplates()),
    [kidsMode],
  );
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
  const [textOverlays, setTextOverlays] = useState<DraftTextOverlay[]>([]);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [gapMenuIndex, setGapMenuIndex] = useState<number | null>(null);
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  const [audioMixMode, setAudioMixMode] = useState<AudioMixMode>("replace");
  const [customSoundUrls, setCustomSoundUrls] = useState<Record<string, string>>({});
  const [soundUrlInput, setSoundUrlInput] = useState("");
  const audioFileInputRef = useRef<HTMLInputElement>(null);
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
  const [captionText, setCaptionText] = useState("");
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
  const [stickerOpen, setStickerOpen] = useState(false);
  const [coachHint, setCoachHint] = useState<string | null>(null);
  const [memoryJar, setMemoryJar] = useState<MemoryMoment[]>(() => loadMemoryJar());
  const [memoryNote, setMemoryNote] = useState("");

  const theme: ThemeCard = useMemo(
    () => getThemeById(themeId) ?? themes[0],
    [themeId, themes],
  );

  const globalTransition: TransitionKind =
    transitionOverride ?? theme.transition;

  const activeTransition: TransitionKind = transitionIntoClip(
    clips,
    activeIndex,
    globalTransition,
  );

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
      setCaptionText(base.captionText ?? "");
      setWatermark(base.watermark);
      setDurationTargetSec(base.durationTargetSec);
      setExportDestination(base.exportDestination);
      setShareId(base.shareId);
      setSharePassword(base.sharePassword === true);
      setTextOverlays(base.textOverlays ?? []);
      setCustomSounds(base.customSounds ?? []);
      setAudioMixMode(base.audioMixMode ?? "replace");
      if (base.transitionOverride) {
        setTransitionOverride(base.transitionOverride);
      } else if (paramTemplate) {
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
      const soundUrls: Record<string, string> = {};
      for (const sound of base.customSounds ?? []) {
        if (sound.source === "file") {
          const blob = await getBlob(soundBlobKey(sound.id));
          if (cancelled) return;
          if (blob) {
            soundUrls[sound.id] = trackUrl(URL.createObjectURL(blob));
          }
        } else if (sound.url) {
          soundUrls[sound.id] = sound.url;
        }
      }
      setCustomSoundUrls(soundUrls);
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
      audioMixMode,
      customSounds,
      textStyle,
      textTransition,
      captionStyle,
      captionText,
      textOverlays,
      transitionOverride,
      watermark,
      durationTargetSec,
      exportDestination,
      shareId,
      sharePassword,
      clips: clips.map(
        ({
          id,
          fileName,
          mimeType,
          kind,
          durationSec,
          mute,
          transitionOut,
        }): DraftClipMeta => ({
          id,
          fileName,
          mimeType,
          kind,
          durationSec,
          mute,
          transitionOut: transitionOut ?? null,
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
    audioMixMode,
    customSounds,
    textStyle,
    textTransition,
    captionStyle,
    captionText,
    textOverlays,
    transitionOverride,
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

  const setGapTransition = useCallback(
    (afterIndex: number, kind: TransitionKind | null) => {
      setClips((prev) =>
        prev.map((c, i) =>
          i === afterIndex
            ? {
                ...c,
                transitionOut: kind,
              }
            : c,
        ),
      );
      setGapMenuIndex(null);
      setTransitionKey((k) => k + 1);
      setStatus(
        kind
          ? `Gap after clip ${afterIndex + 1} · ${transitionLabel(kind)}`
          : `Gap after clip ${afterIndex + 1} · theme default`,
      );
    },
    [],
  );

  const gapTransitionKind = useCallback(
    (afterIndex: number): TransitionKind => {
      const c = clips[afterIndex];
      return c?.transitionOut ?? globalTransition;
    },
    [clips, globalTransition],
  );

  const addTextOverlay = useCallback(() => {
    const at = trackElapsed;
    const overlay = defaultTextOverlay(at, Math.min(totalDuration || at + 3, at + 3), "New text");
    setTextOverlays((prev) => [...prev, overlay]);
    setEditingOverlayId(overlay.id);
    setStatus("Added text overlay on timeline");
  }, [trackElapsed, totalDuration]);

  const updateTextOverlay = useCallback(
    (id: string, patch: Partial<DraftTextOverlay>) => {
      setTextOverlays((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      );
    },
    [],
  );

  const removeTextOverlay = useCallback((id: string) => {
    setTextOverlays((prev) => prev.filter((o) => o.id !== id));
    setEditingOverlayId((cur) => (cur === id ? null : cur));
  }, []);

  const importAudioFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const added: CustomSound[] = [];
      for (const file of list) {
        if (!audioKindFromMime(file.type, file.name)) {
          setStatus(`Skipped non-audio: ${file.name}`);
          continue;
        }
        const id = newSoundId();
        await putBlob(soundBlobKey(id), file);
        const objectUrl = trackUrl(URL.createObjectURL(file));
        const sound: CustomSound = {
          id,
          name: file.name.replace(/\.[^.]+$/, "") || file.name,
          mimeType: file.type || "audio/mpeg",
          source: "file",
          path: `local:sound:${id}/${file.name}`,
        };
        added.push(sound);
        setCustomSoundUrls((prev) => ({ ...prev, [id]: objectUrl }));
      }
      if (added.length) {
        setCustomSounds((prev) => [...prev, ...added]);
        const last = added[added.length - 1];
        setAudioTrackRef(`custom:${last.id}`);
        setStatus(`Imported sound · ${last.name}`);
      }
    },
    [trackUrl],
  );

  const importAudioUrl = useCallback(() => {
    const url = soundUrlInput.trim();
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setStatus("Invalid audio URL");
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setStatus("Audio URL must be http(s)");
      return;
    }
    const id = newSoundId();
    const name =
      decodeURIComponent(parsed.pathname.split("/").pop() || "Remote sound")
        .replace(/\.[^.]+$/, "") || "Remote sound";
    const sound: CustomSound = {
      id,
      name,
      source: "url",
      url,
      mimeType: "audio/mpeg",
    };
    setCustomSounds((prev) => [...prev, sound]);
    setCustomSoundUrls((prev) => ({ ...prev, [id]: url }));
    setAudioTrackRef(`custom:${id}`);
    setSoundUrlInput("");
    setStatus(
      `Added remote sound · ${name} (CORS may block preview/export from other sites)`,
    );
  }, [soundUrlInput]);

  const selectCustomSound = useCallback(
    (sound: CustomSound) => {
      setAudioTrackRef(`custom:${sound.id}`);
      setStatus(`Custom sound · ${sound.name}`);
    },
    [],
  );

  const previewCustomSound = useCallback(
    (sound: CustomSound) => {
      const url = customSoundUrls[sound.id] || sound.url;
      if (previewingId === sound.id) {
        stopPreview();
        return;
      }
      stopPreview();
      if (!url) {
        setStatus("No audio URL for this sound");
        return;
      }
      previewHandle.current = startBeatPreview({
        previewUrl: url,
        bpm: selectedBeat.bpm,
        mood: ["custom"],
        onMode: (m) => setPreviewMode(m),
        onError: (msg) =>
          setStatus(
            `${msg} · remote audio often needs CORS; try uploading the file instead`,
          ),
      });
      setPreviewingId(sound.id);
    },
    [customSoundUrls, previewingId, selectedBeat.bpm, stopPreview],
  );

  const removeCustomSound = useCallback(
    async (id: string) => {
      await deleteBlob(soundBlobKey(id));
      setCustomSounds((prev) => prev.filter((s) => s.id !== id));
      setCustomSoundUrls((prev) => {
        const next = { ...prev };
        const url = next[id];
        if (url && url.startsWith("blob:")) revokeUrl(url);
        delete next[id];
        return next;
      });
      if (customIdFromTrackRef(audioTrackRef) === id) {
        setAudioTrackRef(beats[0]?.packRef ?? "audio.ocean-drift-084@1.0.0");
      }
      setStatus("Removed custom sound");
    },
    [audioTrackRef, beats, revokeUrl],
  );

  const activeOverlays = useMemo(
    () =>
      textOverlays.filter(
        (o) =>
          o.value.trim() &&
          trackElapsed >= o.at &&
          trackElapsed < o.end,
      ),
    [textOverlays, trackElapsed],
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
    setCaptionText(d.captionText ?? "");
    setWatermark(false);
    setDurationTargetSec(undefined);
    setExportDestination("custom");
    setShareId(undefined);
    setSharePassword(false);
    setTextOverlays([]);
    setEditingOverlayId(null);
    setCustomSounds([]);
    setCustomSoundUrls({});
    setAudioMixMode("replace");
    setTransitionOverride(null);
    setGapMenuIndex(null);
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
      const customId = customIdFromTrackRef(audioTrackRef);
      const customUrl = customId ? customSoundUrls[customId] : undefined;
      const catalogUrl = selectedBeat.previewUrl;
      let audioOpts:
        | {
            previewUrl?: string;
            mixUrl?: string;
            beatName?: string;
            ducking?: boolean;
          }
        | undefined;
      if (customUrl && audioMixMode === "mix" && catalogUrl) {
        audioOpts = {
          previewUrl: customUrl,
          mixUrl: catalogUrl,
          beatName: customSounds.find((x) => x.id === customId)?.name ?? "Custom + beat",
          ducking,
        };
      } else if (customUrl) {
        audioOpts = {
          previewUrl: customUrl,
          beatName: customSounds.find((x) => x.id === customId)?.name ?? "Custom sound",
          ducking,
        };
      } else if (catalogUrl) {
        audioOpts = {
          previewUrl: catalogUrl,
          beatName: selectedBeat.name,
          ducking,
        };
      }
      const result = await exportSlideshowWebm({
        clips: clips.map((c) => ({
          id: c.id,
          kind: c.kind,
          objectUrl: c.objectUrl,
          fileName: c.fileName,
          durationSec: c.durationSec,
          transitionOut: c.transitionOut,
        })),
        theme,
        title,
        aspect,
        transition: globalTransition,
        textOverlays,
        captionText,
        captionStyle,
        textStyle,
        shortEdge: preset.shortEdge,
        watermark,
        audio: audioOpts,
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
      captionText,
      watermark,
      durationTargetSec,
      exportDestination,
      shareId,
      sharePassword,
      clips: clips.map(({ id, fileName, mimeType, kind, durationSec, mute, transitionOut }) => ({
        id,
        fileName,
        mimeType,
        kind,
        durationSec,
        mute,
        transitionOut: transitionOut ?? null,
      })),
      textOverlays,
      customSounds,
      audioMixMode,
      transitionOverride,
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
      captionText,
      watermark,
      durationTargetSec,
      exportDestination,
      shareId,
      sharePassword,
      clips: clips.map(({ id, fileName, mimeType, kind, durationSec, mute, transitionOut }) => ({
        id,
        fileName,
        mimeType,
        kind,
        durationSec,
        mute,
        transitionOut: transitionOut ?? null,
      })),
      textOverlays,
      customSounds,
      audioMixMode,
      transitionOverride,
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

  const runStoryCoach = () => {
    const suggestion = suggestStoryCopy({
      themeName: theme.name,
      clipCount: clips.length,
      existingTitle: title,
    });
    setTitle(suggestion.title);
    setCaptionText(suggestion.caption);
    setCoachHint(`Story coach · “${suggestion.title}” + caption ready`);
  };

  const saveToMemoryJar = () => {
    const entry = addMemoryMoment({
      title: title.trim() || "Untitled voyage",
      note: memoryNote.trim() || captionText.trim() || `${clips.length} clips · ${theme.name}`,
      themeName: theme.name,
      clipCount: clips.length,
    });
    setMemoryJar(loadMemoryJar());
    setMemoryNote("");
    setCoachHint(`Saved to Memory jar · ${entry.title}`);
  };

  const stampSticker = (sticker: string) => {
    const overlay = {
      ...defaultTextOverlay(0, 4, sticker),
      position: "center" as const,
      style: "clean-sans" as const,
    };
    setTextOverlays((prev) => [...prev, overlay]);
    setEditingOverlayId(overlay.id);
    setStickerOpen(false);
    setCoachHint(`Sticker stamped · ${sticker}`);
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
          <div className="title-emoji-row" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, maxWidth: 360 }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Project title"
              placeholder="Untitled voyage ✨"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                fontSize: "1rem",
                fontFamily: "Sora, sans-serif",
                fontWeight: 600,
                flex: 1,
                minWidth: 0,
                padding: "4px 0",
              }}
            />
            <EmojiPicker onSelect={(emoji) => setTitle((t) => t + emoji)} />
          </div>
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

      <div className="human-help-bar" aria-label="Story coach and tools">
        <button type="button" className="btn btn-ghost" onClick={runStoryCoach} title="Suggest title and caption from theme + clips">
          ✨ Story coach
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={saveToMemoryJar}
          title="Save this moment to Memory jar"
        >
          🫙 Memory jar
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setStickerOpen((o) => !o)}
          aria-expanded={stickerOpen}
        >
          🌟 Stickers
        </button>
        <input
          className="memory-note-input"
          value={memoryNote}
          onChange={(e) => setMemoryNote(e.target.value)}
          placeholder="Memory note (optional)"
          aria-label="Memory jar note"
        />
        {coachHint && (
          <span className="muted" style={{ fontSize: "0.8rem" }} role="status">
            {coachHint}
          </span>
        )}
      </div>

      {stickerOpen && (
        <div className="sticker-tray" role="listbox" aria-label="Sticker stamp tray">
          <p className="muted" style={{ margin: "0 0 8px", fontSize: "0.8rem" }}>
            Tap a sticker to stamp it as a text overlay on the timeline.
          </p>
          <div className="sticker-grid">
            {STICKER_PACK.map((s) => (
              <button
                key={s}
                type="button"
                className="sticker-cell"
                onClick={() => stampSticker(s)}
                aria-label={`Stamp ${s}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {memoryJar.length > 0 && (
        <details className="memory-jar-panel">
          <summary>
            Memory jar ({memoryJar.length})
          </summary>
          <ul className="memory-jar-list">
            {memoryJar.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.title}</strong>
                  <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                    {m.note}
                    {m.themeName ? ` · ${m.themeName}` : ""}
                    {typeof m.clipCount === "number" ? ` · ${m.clipCount} clips` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-linkish"
                  onClick={() => {
                    removeMemoryMoment(m.id);
                    setMemoryJar(loadMemoryJar());
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

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
                      }${durationTargetSec ? ` · target ${durationTargetSec}s` : ""}`}
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
              <Fragment key={c.id}>
              <div className="film-clip-wrap">
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
                {i < clips.length - 1 && (
                  <div className="film-gap" key={`gap-${c.id}`}>
                    <button
                      type="button"
                      className={`film-gap-btn${gapMenuIndex === i ? " open" : ""}${c.transitionOut ? " custom" : ""}`}
                      title={`Transition after clip ${i + 1}: ${transitionLabel(gapTransitionKind(i))}`}
                      onClick={() =>
                        setGapMenuIndex((cur) => (cur === i ? null : i))
                      }
                    >
                      ✦
                      <span className="film-gap-label">
                        {transitionLabel(gapTransitionKind(i))}
                      </span>
                    </button>
                    {gapMenuIndex === i && (
                      <div className="film-gap-menu" role="menu">
                        <button
                          type="button"
                          className={!c.transitionOut ? "active" : ""}
                          onClick={() => setGapTransition(i, null)}
                        >
                          Theme default ({transitionLabel(globalTransition)})
                        </button>
                        {TRANSITIONS.map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            className={
                              c.transitionOut === kind ? "active" : ""
                            }
                            onClick={() => setGapTransition(i, kind)}
                          >
                            {transitionLabel(kind)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Fragment>
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
          <p className="muted" style={{ fontSize: "0.75rem", textAlign: "center", marginTop: 6 }}>
            Tap ✦ between clips to set a per-gap transition (preview + WebM + CLI).
          </p>
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
              Default transition
            </div>
            <p className="muted" style={{ fontSize: "0.7rem", margin: "0 0 6px" }}>
              Used for gaps without a per-clip pick on the filmstrip.
            </p>
            <div className="chip-row" style={{ marginTop: 6, flexWrap: "wrap" }}>
              {TRANSITIONS.filter((k) => k !== "cut").map((kind) => {
                const selected = globalTransition === kind;
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
              Default {globalTransition} · enter uses {activeTransition} · {theme.transitionDurationMs}ms
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
              Title style, entrance, and caption preset (original Voyajes packs). Emoji welcome in title &amp; caption.
            </p>
            <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 6 }}>
              Caption text
            </div>
            <div className="comment-compose-row" style={{ marginBottom: 12 }}>
              <input
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                placeholder="Overlay caption… 🌴✈️"
                aria-label="Caption text"
                style={{
                  flex: 1,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                  padding: "8px 10px",
                }}
              />
              <EmojiPicker onSelect={(emoji) => setCaptionText((t) => t + emoji)} />
            </div>
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

            <div className="muted" style={{ fontSize: "0.8rem", margin: "16px 0 6px" }}>
              Timeline text overlays
            </div>
            <p className="muted" style={{ fontSize: "0.75rem", marginTop: 0 }}>
              Bound to time ranges — place on a clip or span clips. Preview + export draw them.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "6px 12px", fontSize: "0.8rem", marginBottom: 8 }}
              onClick={addTextOverlay}
            >
              + Add text at {formatTime(trackElapsed)}
            </button>
            <div className="overlay-list">
              {textOverlays.map((o) => {
                const open = editingOverlayId === o.id;
                return (
                  <div key={o.id} className={`overlay-row${open ? " open" : ""}`}>
                    <button
                      type="button"
                      className="overlay-row-head"
                      onClick={() =>
                        setEditingOverlayId((cur) => (cur === o.id ? null : o.id))
                      }
                    >
                      <span>{o.value.trim() || "(empty)"}</span>
                      <span className="muted" style={{ fontSize: "0.7rem" }}>
                        {formatTime(o.at)}–{formatTime(o.end)} · {o.position}
                      </span>
                    </button>
                    {open && (
                      <div className="overlay-editor">
                        <label>
                          Text
                          <div className="comment-compose-row">
                            <input
                              value={o.value}
                              onChange={(e) =>
                                updateTextOverlay(o.id, { value: e.target.value })
                              }
                            />
                            <EmojiPicker
                              onSelect={(emoji) =>
                                updateTextOverlay(o.id, {
                                  value: o.value + emoji,
                                })
                              }
                            />
                          </div>
                        </label>
                        <div className="overlay-time-row">
                          <label>
                            Start
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={o.at}
                              onChange={(e) =>
                                updateTextOverlay(o.id, {
                                  at: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                            />
                          </label>
                          <label>
                            End
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={o.end}
                              onChange={(e) =>
                                updateTextOverlay(o.id, {
                                  end: Math.max(
                                    o.at,
                                    Number(e.target.value) || o.at,
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          Role
                        </div>
                        <div className="chip-row" style={{ flexWrap: "wrap" }}>
                          {(["title", "subtitle", "caption"] as const).map((role) => (
                            <button
                              key={role}
                              type="button"
                              className={`chip${o.role === role ? " chip-active" : ""}`}
                              onClick={() => updateTextOverlay(o.id, { role })}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                        <div className="muted" style={{ fontSize: "0.75rem", marginTop: 8 }}>
                          Position
                        </div>
                        <div className="chip-row" style={{ flexWrap: "wrap" }}>
                          {TEXT_POSITIONS.map((pos) => (
                            <button
                              key={pos}
                              type="button"
                              className={`chip${o.position === pos ? " chip-active" : ""}`}
                              onClick={() =>
                                updateTextOverlay(o.id, { position: pos })
                              }
                            >
                              {pos}
                            </button>
                          ))}
                        </div>
                        <div className="muted" style={{ fontSize: "0.75rem", marginTop: 8 }}>
                          Style
                        </div>
                        <div className="chip-row" style={{ flexWrap: "wrap" }}>
                          {TEXT_STYLE_KINDS.map((st) => (
                            <button
                              key={st}
                              type="button"
                              className={`chip${o.style === st ? " chip-active" : ""}`}
                              onClick={() =>
                                updateTextOverlay(o.id, { style: st })
                              }
                            >
                              {textStyleLabel(st)}
                            </button>
                          ))}
                        </div>
                        <label style={{ display: "block", marginTop: 8, fontSize: "0.8rem" }}>
                          Color
                          <input
                            type="color"
                            value={/^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : "#ffffff"}
                            onChange={(e) =>
                              updateTextOverlay(o.id, { color: e.target.value })
                            }
                            style={{ marginLeft: 8, verticalAlign: "middle" }}
                          />
                        </label>
                        <div className="muted" style={{ fontSize: "0.75rem", marginTop: 8 }}>
                          Animation in
                        </div>
                        <div className="chip-row" style={{ flexWrap: "wrap" }}>
                          {TEXT_TRANSITION_KINDS.map((tx) => (
                            <button
                              key={tx}
                              type="button"
                              className={`chip${o.animationIn === tx ? " chip-active" : ""}`}
                              onClick={() =>
                                updateTextOverlay(o.id, { animationIn: tx })
                              }
                            >
                              {textTransitionLabel(tx)}
                            </button>
                          ))}
                        </div>
                        <div className="muted" style={{ fontSize: "0.75rem", marginTop: 8 }}>
                          Animation out
                        </div>
                        <div className="chip-row" style={{ flexWrap: "wrap" }}>
                          {TEXT_TRANSITION_KINDS.map((tx) => (
                            <button
                              key={tx}
                              type="button"
                              className={`chip${o.animationOut === tx ? " chip-active" : ""}`}
                              onClick={() =>
                                updateTextOverlay(o.id, { animationOut: tx })
                              }
                            >
                              {textTransitionLabel(tx)}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ marginTop: 10, padding: "4px 10px", fontSize: "0.75rem" }}
                          onClick={() => removeTextOverlay(o.id)}
                        >
                          Remove overlay
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {textOverlays.length === 0 && (
                <p className="muted" style={{ fontSize: "0.75rem" }}>
                  No overlays yet — add one to style titles/captions on a time range.
                </p>
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
              Catalog beats or import your own · mix or replace · beat-sync · ducking.
            </p>

            <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 6 }}>
              Custom sounds
            </div>
            <input
              ref={audioFileInputRef}
              type="file"
              accept={AUDIO_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void importAudioFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                onClick={() => audioFileInputRef.current?.click()}
              >
                Upload mp3 / wav / m4a / ogg
              </button>
            </div>
            <div className="comment-compose-row" style={{ marginBottom: 8 }}>
              <input
                value={soundUrlInput}
                onChange={(e) => setSoundUrlInput(e.target.value)}
                placeholder="Paste audio URL…"
                aria-label="Audio URL"
                style={{
                  flex: 1,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                  padding: "8px 10px",
                  fontSize: "0.8rem",
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                onClick={importAudioUrl}
              >
                Add URL
              </button>
            </div>
            <p className="muted" style={{ fontSize: "0.7rem", marginTop: 0 }}>
              Remote URLs often block browser fetch (CORS). Upload the file if preview/export fails.
            </p>
            {customSounds.length > 0 && (
              <div className="beat-list" style={{ marginBottom: 12 }}>
                {customSounds.map((sound) => {
                  const selected = audioTrackRef === `custom:${sound.id}`;
                  const playing = previewingId === sound.id;
                  return (
                    <div
                      key={sound.id}
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
                        onClick={() => selectCustomSound(sound)}
                      >
                        <span className="beat-name">{sound.name}</span>
                        <span className="muted beat-meta">
                          {sound.source === "url" ? "URL" : "File"} · custom
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`btn btn-ghost beat-play${playing ? " is-playing" : ""}`}
                        aria-label={playing ? `Stop ${sound.name}` : `Preview ${sound.name}`}
                        onClick={() => previewCustomSound(sound)}
                      >
                        {playing ? "Stop" : "▶"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                        aria-label={`Remove ${sound.name}`}
                        onClick={() => void removeCustomSound(sound.id)}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 6 }}>
              Mix mode
            </div>
            <div className="chip-row" style={{ marginBottom: 12 }}>
              {(["replace", "mix"] as AudioMixMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`chip${audioMixMode === mode ? " chip-active" : ""}`}
                  onClick={() => {
                    setAudioMixMode(mode);
                    setStatus(
                      mode === "mix"
                        ? "Mix · custom over catalog beat on export"
                        : "Replace · custom or catalog alone",
                    );
                  }}
                >
                  {mode === "mix" ? "Mix with catalog" : "Replace catalog"}
                </button>
              ))}
            </div>

            <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 6 }}>
              Catalog beats
            </div>
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
