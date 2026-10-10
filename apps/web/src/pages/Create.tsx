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
  transitionIcon,
  transitionLabel,
  type ThemeCard,
} from "../data/themes";
import {
  getInvitationTemplates,
  getKidsSafeTemplates,
  getTemplateById,
  getVoyageTemplates,
  isInvitationTemplate,
  type TemplateCard,
} from "../data/templates";
import type { ProjectMode } from "@voyajes/core";
import { usePrefs } from "../hooks/usePrefs";
import { useAiActivity } from "../hooks/useAiActivity";
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
import { assetUrl } from "../lib/assetUrl";
import { ensureShareFromDraft, publicShareUrl } from "../lib/shareStore";
import { buildPortableShareUrl } from "../lib/portableShare";
import {
  downloadBlob,
  exportSlideshowWebm,
  type ExportProgress,
} from "../lib/exportWebm";
import {
  exportSlideshowGif,
  filenameFromTitleGif,
  GIF_SIZE_HINT,
  VIDEO_HEAVY_BYTES,
} from "../lib/exportGif";
import {
  clearLastExport,
  getLastExport,
  getLastGifExport,
  setLastExport,
} from "../lib/lastExportStore";
import {
  blobToShareFile,
  buildWhatsAppInviteText,
  canShareMediaFile,
  shareInviteToWhatsApp,
} from "../lib/whatsappShare";
import {
  consumeStartFresh,
  peekStartFresh,
  type FreshMode,
} from "../lib/startFresh";
import { MediaImporter } from "../components/MediaImporter";
import { Timeline, type TLSelection } from "../components/editor/Timeline";
import {
  AnimationPicker,
  GradePicker,
  InspectorSection,
  KeyframeEditor,
  TransitionBrowser,
} from "../components/editor/Inspector";
import { AnimatedLayer } from "../components/editor/AnimatedLayer";
import { useHistory } from "../hooks/useHistory";
import { computeLayout, themeLayer, transitionEasingInto, transitionSecInto } from "../lib/timelineRender";
import { TimelineAudioPlayer, type ResolvedAudioClip } from "../lib/timelineAudio";
import {
  clipStarts,
  easingCss,
  gradeFilter,
  keyframesAt,
  locateTime,
  upsertKeyframe,
  clampSpeed,
  sourceTimeAt,
  framesAt,
  duckWindows,
  effectiveAudioClips,
  SPEED_PRESETS,
  type AudioClip,
  type TimelineLayout,
  type ClipAnimation,
  type GradePreset,
  type Keyframe,
  type TransitionSpec,
} from "@voyajes/core";
import {
  defaultLibraryForTheme,
  getLibraryItem,
  libraryAssetUrl,
  type LibraryItem,
} from "../data/library";

type LiveClip = DraftClipMeta & { objectUrl: string };

/** Strip runtime-only fields for persistence / share snapshots. */
function toClipMeta(c: LiveClip): DraftClipMeta {
  const { objectUrl: _u, ...meta } = c;
  return { ...meta, transitionOut: meta.transitionOut ?? null };
}

type EditorSnapshot = {
  clips: LiveClip[];
  textOverlays: DraftTextOverlay[];
  themeId: string;
  templateId: string | undefined;
  transitionOverride: TransitionKind | null;
  grade: GradePreset | undefined;
  defaultAnimation: ClipAnimation | undefined;
  projectTxSpec: TransitionSpec | undefined;
  textStyle: TextStyle;
  textTransition: TextTransition;
  audioTrackRef: string;
  beatSync: BeatSync;
  aspect: Aspect;
  audioClips: AudioClip[] | undefined;
  autoDuck: boolean | undefined;
};

function keyframesAtSafe(keys: Keyframe[] | undefined, t: number) {
  const v = keyframesAt(keys, t);
  return { x: v.x, y: v.y, scale: v.scale, rotation: v.rotation, opacity: v.opacity };
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

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
  const [params, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { prefs } = usePrefs();
  const ai = useAiActivity();
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
  /** While true, draft autosave must not write (avoids race during fresh wipe). */
  const persistPausedRef = useRef(false);
  /** Prevent remount-effect from double-wiping after mount hydrate handled fresh. */
  const freshHandledRef = useRef(false);

  const paramTemplate = getTemplateById(params.get("template") ?? "");
  const paramTheme =
    getThemeById(params.get("theme") ?? "") ??
    (paramTemplate ? getThemeById(paramTemplate.themeId) : undefined) ??
    themes.find((t) => t.id === "theme.ocean-pop") ??
    themes[0];

  const [projectMode, setProjectMode] = useState<ProjectMode>(
    params.get("mode") === "invitation" || paramTemplate?.mode === "invitation"
      ? "invitation"
      : "voyage",
  );

  /** Keep ?mode=invitation in the URL (basename-safe via react-router search params). */
  const syncModeInUrl = (mode: ProjectMode) => {
    const next = new URLSearchParams(params);
    if (mode === "invitation") next.set("mode", "invitation");
    else next.delete("mode");
    setSearchParams(next, { replace: true });
  };

  // Respond when nav / Home CTA land on Create with ?mode=invitation without remounting
  useEffect(() => {
    const modeParam = params.get("mode");
    if (modeParam === "invitation" || paramTemplate?.mode === "invitation") {
      setProjectMode("invitation");
      setTitle((prev) =>
        !prev || prev === "Untitled voyage" ? "You're invited!" : prev,
      );
      return;
    }
    if (modeParam === null || modeParam === "voyage") {
      setProjectMode("voyage");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("mode"), paramTemplate?.id]);

  const templates = useMemo(() => {
    if (projectMode === "invitation") {
      const invites = getInvitationTemplates();
      if (kidsMode) {
        return invites.filter((tpl) =>
          getKidsSafeTemplates().some((k) => k.id === tpl.id),
        ).length
          ? invites.filter((tpl) =>
              getKidsSafeTemplates().some((k) => k.id === tpl.id),
            )
          : invites;
      }
      return invites;
    }
    return kidsMode ? getKidsSafeTemplates() : getVoyageTemplates();
  }, [kidsMode, projectMode]);
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
  const [hostName, setHostName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventWhen, setEventWhen] = useState("");
  const [eventWhere, setEventWhere] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"file" | "metronome" | null>(
    null,
  );
  const [clips, setClips] = useState<LiveClip[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const layoutRef = useRef<TimelineLayout>({ starts: [], tx: [], total: 0 });
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [transitionKey, setTransitionKey] = useState(0);
  /** On-screen HUD when a transition is picked (compose chrome only). */
  const [transitionFlash, setTransitionFlash] = useState<{
    kind: TransitionKind;
    token: number;
  } | null>(null);
  const transitionFlashTimer = useRef<number | null>(null);
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
  const [mediaImporterOpen, setMediaImporterOpen] = useState(false);
  const [mediaImporterMode, setMediaImporterMode] = useState<"clips" | "audio" | "all">("all");
  /** Minimalist secondary sheets: theme | audio | text | null */
  const [miniSheet, setMiniSheet] = useState<"theme" | "audio" | "text" | null>(null);
  // v2 timeline / pro-editor state
  const [grade, setGrade] = useState<GradePreset | undefined>(undefined);
  const [defaultAnimation, setDefaultAnimation] = useState<ClipAnimation | undefined>(undefined);
  const [projectTxSpec, setProjectTxSpec] = useState<TransitionSpec | undefined>(undefined);
  const [selection, setSelection] = useState<TLSelection>(null);
  const [appliedChip, setAppliedChip] = useState<{ label: string; snap: EditorSnapshot | null } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [audioClips, setAudioClips] = useState<AudioClip[] | undefined>(undefined);
  const [autoDuck, setAutoDuck] = useState<boolean | undefined>(undefined);
  const historyRef = useRef<{
    checkpoint: () => EditorSnapshot | null;
    restore: (s: EditorSnapshot) => void;
  } | null>(null);
  const clipsRef = useRef<LiveClip[]>([]);

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

  // Overlapping (xfade) layout — identical math to WebM/GIF export and CLI
  const layout = useMemo(
    () => computeLayout(clips, globalTransition, projectTxSpec, theme),
    [clips, globalTransition, projectTxSpec, theme],
  );
  const totalDuration = layout.total;

  clipsRef.current = clips;
  layoutRef.current = layout;
  const minimalist = prefs.minimalistMode;

  const trackElapsed = (layout.starts[activeIndex] ?? 0) + elapsed;

  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }, []);

  const trackUrl = useCallback((url: string) => {
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  // Hydrate from localStorage + IndexedDB (or start fresh when ?fresh=1 / session flag)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessionFresh = peekStartFresh();
      const wantFresh = params.get("fresh") === "1" || sessionFresh != null;
      if (wantFresh) {
        freshHandledRef.current = true;
        persistPausedRef.current = true;
        await clearAllBlobs();
        clearDraft();
        clearLastExport();
        if (cancelled) {
          persistPausedRef.current = false;
          return;
        }
        const modeFromSession: FreshMode | null = sessionFresh;
        consumeStartFresh();
        const mode: ProjectMode =
          modeFromSession === "invitation" ||
          params.get("mode") === "invitation" ||
          paramTemplate?.mode === "invitation"
            ? "invitation"
            : modeFromSession === "voyage"
              ? "voyage"
              : params.get("mode") === "invitation"
                ? "invitation"
                : "voyage";
        const tid = paramTheme.id;
        const d = defaultDraft(tid);
        const freshTitle = mode === "invitation" ? "You're invited!" : d.title;
        setProjectMode(mode);
        setTitle(freshTitle);
        setAspect(d.aspect);
        setThemeId(tid);
        setTemplateId(undefined);
        setTransitionOverride(null);
        setGrade(undefined);
        setDefaultAnimation(undefined);
        setProjectTxSpec(undefined);
        setAudioTrackRef(d.audioTrackRef);
        setBeatSync(d.beatSync);
        setDucking(d.ducking);
        setTextStyle(d.textStyle);
        setTextTransition(d.textTransition);
        setCaptionStyle(d.captionStyle);
        setCaptionText("");
        setWatermark(false);
        setDurationTargetSec(undefined);
        setExportDestination("custom");
        setShareId(undefined);
        setSharePassword(false);
        setHostName("");
        setGuestName("");
        setEventName("");
        setEventType("");
        setEventWhen("");
        setEventWhere("");
        setTextOverlays([]);
        setCustomSounds([]);
        setCustomSoundUrls({});
        setAudioMixMode("replace");
        setClips([]);
        setActiveIndex(0);
        setElapsed(0);
        setSchemaOk(true);
        setStatus("Started fresh");
        {
          const next = new URLSearchParams(params);
          next.delete("fresh");
          if (mode === "invitation") next.set("mode", "invitation");
          else next.delete("mode");
          next.delete("template");
          setSearchParams(next, { replace: true });
        }
        // Flush React state, then persist empty default once before resuming autosave.
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        if (cancelled) {
          persistPausedRef.current = false;
          return;
        }
        saveDraft({
          ...d,
          mode,
          title: freshTitle,
          themeId: tid,
        });
        persistPausedRef.current = false;
        setHydrated(true);
        return;
      }

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
        if (paramTemplate.mode === "invitation" || (paramTemplate.tags ?? []).includes("invitation")) {
          base.mode = "invitation";
        }
      }
      if (params.get("mode") === "invitation") {
        base.mode = "invitation";
        if (!draft && (!base.title || base.title === "Untitled voyage")) {
          base.title = "You're invited!";
        }
      }
      if (cancelled) return;
      const resolvedMode: ProjectMode =
        base.mode === "invitation" ? "invitation" : "voyage";
      setProjectMode(resolvedMode);
      // Reflect invitation on the URL so nav/share links stay correct under /voyajes/
      {
        const next = new URLSearchParams(params);
        if (resolvedMode === "invitation") next.set("mode", "invitation");
        else next.delete("mode");
        const cur = params.toString();
        const nxt = next.toString();
        if (cur !== nxt) setSearchParams(next, { replace: true });
      }
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
      setHostName(base.hostName ?? "");
      setGuestName(base.guestName ?? "");
      setEventName(base.eventName ?? "");
      setEventType(base.eventType ?? "");
      setEventWhen(base.eventWhen ?? "");
      setEventWhere(base.eventWhere ?? "");
      setTextOverlays(base.textOverlays ?? []);
      setCustomSounds(base.customSounds ?? []);
      setAudioMixMode(base.audioMixMode ?? "replace");
      setGrade(base.grade);
      setDefaultAnimation(base.defaultAnimation);
      setProjectTxSpec(base.transitionSpec);
      setAudioClips(base.audioClips);
      setAutoDuck(base.autoDuck);
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
    if (!hydrated || persistPausedRef.current) return;
    const draft: DraftState = {
      title,
      mode: projectMode,
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
      grade,
      defaultAnimation,
      transitionSpec: projectTxSpec,
      audioClips,
      autoDuck,
      watermark,
      durationTargetSec,
      exportDestination,
      shareId,
      sharePassword,
      hostName,
      guestName,
      eventName,
      eventType,
      eventWhen,
      eventWhere,
      clips: clips.map(toClipMeta),
      updatedAt: new Date().toISOString(),
    };
    saveDraft(draft);
    setSchemaOk(validatePersistedProject().ok);
  }, [
    hydrated,
    title,
    projectMode,
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
    grade,
    defaultAnimation,
    projectTxSpec,
    audioClips,
    autoDuck,
    watermark,
    durationTargetSec,
    exportDestination,
    shareId,
    sharePassword,
    hostName,
    guestName,
    eventName,
    eventType,
    eventWhen,
    eventWhere,
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
    const tickStart =
      performance.now() - Math.min(elapsedRef.current, clip.durationSec) * 1000;

    // Next clip starts `tx` seconds before this one ends (overlap)
    const holdSec =
      activeIndex < clips.length - 1
        ? clip.durationSec - (layoutRef.current.tx[activeIndex] ?? 0)
        : clip.durationSec;
    const tick = () => {
      const t = (performance.now() - tickStart) / 1000;
      setElapsed(Math.min(t, clip.durationSec));
      if (t < holdSec) {
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
    el.playbackRate = clampSpeed(clip.speed);
    el.currentTime = sourceTimeAt(clip, elapsedRef.current);
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
          ...(kind === "video" ? { sourceSec: durationSec } : {}),
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
      setAudioClips((prev) =>
        prev ? prev.map((a) => (a.ref === audioTrackRef ? { ...a, ref: beat.packRef, label: beat.name } : a)) : prev,
      );
      setAudioTrackRef(beat.packRef);
      if (beatSync !== "off") {
        applyBeatSnap(beatSync, beat.bpm, true);
        setStatus(`Beat · ${beat.name} · holds snapped to ${beatSync}`);
      } else {
        setStatus(`Beat · ${beat.name}`);
      }
    },
    [applyBeatSnap, beatSync, audioTrackRef],
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

  const showTransitionFlash = useCallback((kind: TransitionKind) => {
    if (transitionFlashTimer.current != null) {
      window.clearTimeout(transitionFlashTimer.current);
    }
    const token = Date.now();
    setTransitionFlash({ kind, token });
    transitionFlashTimer.current = window.setTimeout(() => {
      setTransitionFlash((cur) => (cur?.token === token ? null : cur));
      transitionFlashTimer.current = null;
    }, 1800);
  }, []);

  const pickGlobalTransition = useCallback(
    (kind: TransitionKind) => {
      setTransitionOverride(kind === theme.transition ? null : kind);
      setTransitionKey((k) => k + 1);
      showTransitionFlash(kind);
      setStatus(
        kind === theme.transition
          ? `Transition · ${transitionIcon(kind)} ${transitionLabel(kind)} (theme default)`
          : `Transition · ${transitionIcon(kind)} ${transitionLabel(kind)}`,
      );
    },
    [showTransitionFlash, theme.transition],
  );

  const pickRandomTransition = useCallback(() => {
    const pool = TRANSITIONS.filter((k) => k !== "cut");
    const kind = pool[Math.floor(Math.random() * pool.length)] ?? "dissolve";
    setTransitionOverride(kind === theme.transition ? null : kind);
    setTransitionKey((k) => k + 1);
    showTransitionFlash(kind);
    setStatus(`Random transition · ${transitionIcon(kind)} ${transitionLabel(kind)}`);
  }, [showTransitionFlash, theme.transition]);

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
      const resolved = kind ?? globalTransition;
      showTransitionFlash(resolved);
      setStatus(
        kind
          ? `Gap after clip ${afterIndex + 1} · ${transitionIcon(kind)} ${transitionLabel(kind)}`
          : `Gap after clip ${afterIndex + 1} · theme default (${transitionLabel(globalTransition)})`,
      );
    },
    [globalTransition, showTransitionFlash],
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

  const importAnyFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const media: File[] = [];
      const audio: File[] = [];
      for (const f of list) {
        if (clipKindFromMime(f.type, f.name)) media.push(f);
        else if (audioKindFromMime(f.type, f.name)) audio.push(f);
      }
      if (media.length) await importFiles(media);
      if (audio.length) await importAudioFiles(audio);
      if (!media.length && !audio.length) {
        setStatus("No supported photo, video, or audio in that selection");
      }
    },
    [importFiles, importAudioFiles],
  );

  const insertLibraryItem = useCallback(
    async (item: LibraryItem) => {
      const url = libraryAssetUrl(item.url);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const ext = item.url.split(".").pop() || (item.kind === "audio" ? "mp3" : "webp");
        const mime =
          blob.type ||
          (item.kind === "audio"
            ? "audio/mpeg"
            : item.kind === "video"
              ? "video/mp4"
              : "image/webp");
        const file = new File([blob], `${item.title.replace(/\s+/g, "-").toLowerCase()}.${ext}`, {
          type: mime,
        });
        if (item.kind === "audio") {
          await importAudioFiles([file]);
          setStatus(`Library audio · ${item.title}`);
        } else {
          await importFiles([file]);
          setStatus(`Library ${item.kind} · ${item.title}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "fetch failed";
        setStatus(`Library insert failed · ${item.title} · ${msg}`);
      }
    },
    [importAudioFiles, importFiles],
  );

  const seedTemplateLibraryMedia = useCallback(
    async (tpl: TemplateCard) => {
      if (clipsRef.current.length > 0) return;
      const pick = defaultLibraryForTheme({
        themeId: tpl.themeId,
        tags: tpl.tags,
        name: tpl.name,
      });
      for (const id of pick.photoIds) {
        const item = getLibraryItem(id);
        if (item) await insertLibraryItem(item);
      }
      const audio = getLibraryItem(pick.audioId);
      if (audio) await insertLibraryItem(audio);
      setStatus(`Template · ${tpl.name} · library media applied`);
    },
    [insertLibraryItem],
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
      const invite = isInvitationTemplate(tpl);
      const snapBefore = historyRef.current?.checkpoint() ?? null;
      setTemplateId(tpl.id);
      // Layered preset: theme layer + template timing/transition/animation slots
      setGrade(undefined);
      setProjectTxSpec({
        durationSec: Math.min(2, Math.max(0.2, tpl.transitionDurationMs / 1000)),
        easing: tpl.motion === "snappy" ? "back-out" : "ease-in-out",
      });
      setDefaultAnimation(
        themeLayer({ id: tpl.themeId, motion: tpl.motion, photoMotion: tpl.photoMotion, tags: tpl.tags })
          .animation,
      );
      setClips((prev) =>
        prev.map((c) => ({ ...c, transitionOut: null, transitionSpec: undefined, animation: undefined })),
      );
      if (!invite) {
        setTextOverlays((prev) =>
          prev.some((o) => o.value.trim())
            ? prev
            : [
                {
                  ...defaultTextOverlay(0, 2.6, title.trim() && title.trim() !== "Untitled voyage" ? title.trim() : tpl.name),
                  role: "title",
                  style: tpl.textStyle,
                  animationIn: tpl.textTransition,
                  position: "center" as TextPosition,
                  animation: { in: tpl.motion === "snappy" ? "pop" : "slide-up", out: "fade" },
                },
              ],
        );
      }
      setAppliedChip({ label: tpl.name, snap: snapBefore });
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

      if (invite) {
        setProjectMode("invitation");
        syncModeInUrl("invitation");
        const nextTitle = tpl.defaultTitle || "You're invited!";
        setTitle(nextTitle);
        const et = tpl.eventType || "";
        if (et) {
          setEventType(et);
          setEventName((prev) => (prev.trim() ? prev : et));
        }
        const starters = [...(tpl.defaultOverlays ?? [])];
        if (tpl.defaultEmojis?.length && !starters.some((s) => /\p{Extended_Pictographic}/u.test(s.value))) {
          starters.push({
            value: tpl.defaultEmojis.join(" "),
            role: "caption",
          });
        }
        if (starters.length) {
          setTextOverlays((prev) => {
            const keepUser = prev.filter(
              (o) =>
                o.value.trim() &&
                !["You're invited", "You're invited!", "Join us", "New text"].includes(
                  o.value.trim(),
                ),
            );
            if (keepUser.length >= 2) return keepUser;
            const built = starters.map((s, i) => ({
              ...defaultTextOverlay(i * 0.25, 3.8 + i * 0.4, s.value),
              role: s.role ?? (i === 0 ? "title" : "caption"),
              style: tpl.textStyle,
              animationIn: tpl.textTransition,
              position: (i === 0 ? "center" : "bottom") as TextPosition,
            }));
            return keepUser.length ? [...built, ...keepUser] : built;
          });
        }
      }

      setTransitionKey((k) => k + 1);
      showTransitionFlash(tpl.transition);
      const themeName = th?.name ?? tpl.themeId;
      const beatName = beat?.name ?? tpl.beatId;
      const tx = `${transitionIcon(tpl.transition)} ${transitionLabel(tpl.transition)}`;
      setStatus(
        invite
          ? `Applied ${tpl.name} · ${themeName} · ${beatName} · ${tx}`
          : `Template · ${tpl.name} · ${themeName} · ${beatName} · ${tx}`,
      );
      ai.pulse("template", 1200);
      setMiniSheet(null);
      void seedTemplateLibraryMedia(tpl);
    },
    [ai, applyBeatSnap, seedTemplateLibraryMedia, showTransitionFlash, syncModeInUrl, title],
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

  const resetProject = async (opts?: {
    mode?: ProjectMode;
    statusMsg?: string;
    /** Theme to keep after wipe (defaults to current themeId). */
    keepThemeId?: string;
  }) => {
    persistPausedRef.current = true;
    setPlaying(false);
    clearAdvanceTimer();
    for (const url of [...objectUrlsRef.current]) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current.clear();
    await clearAllBlobs();
    clearDraft();
    clearLastExport();
    const mode = opts?.mode ?? projectMode;
    const tid = opts?.keepThemeId ?? themeId;
    const d = defaultDraft(tid);
    const freshTitle = mode === "invitation" ? "You're invited!" : d.title;
    setProjectMode(mode);
    setTitle(freshTitle);
    setAspect(d.aspect);
    setThemeId(tid);
    setTemplateId(undefined);
    setTransitionOverride(null);
        setGrade(undefined);
        setDefaultAnimation(undefined);
        setProjectTxSpec(undefined);
    setAudioTrackRef(d.audioTrackRef);
    setBeatSync(d.beatSync);
    setDucking(d.ducking);
    setTextStyle(d.textStyle);
    setTextTransition(d.textTransition);
    setCaptionStyle(d.captionStyle);
    setCaptionText("");
    setWatermark(false);
    setDurationTargetSec(undefined);
    setExportDestination("custom");
    setShareId(undefined);
    setSharePassword(false);
    setHostName("");
    setGuestName("");
    setEventName("");
    setEventType("");
    setEventWhen("");
    setEventWhere("");
    setTextOverlays([]);
    setEditingOverlayId(null);
    setCustomSounds([]);
    setCustomSoundUrls({});
    setAudioMixMode("replace");
    setGapMenuIndex(null);
    stopPreview();
    setClips([]);
    setActiveIndex(0);
    setElapsed(0);
    setSchemaOk(true);
    setStatus(opts?.statusMsg ?? "Draft cleared");
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    saveDraft({
      ...d,
      mode,
      title: freshTitle,
      themeId: tid,
    });
    persistPausedRef.current = false;
  };

  // ?fresh=1 or session flag while Create is already mounted (same-route CTA)
  useEffect(() => {
    const sessionFresh = peekStartFresh();
    const urlFresh = params.get("fresh") === "1";
    if (!urlFresh && sessionFresh == null) {
      // Clear mount-hydrate flag once neither URL nor session says fresh
      freshHandledRef.current = false;
      return;
    }
    if (!hydrated) return;
    if (freshHandledRef.current) {
      freshHandledRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      const mode: ProjectMode =
        sessionFresh === "invitation" || params.get("mode") === "invitation"
          ? "invitation"
          : sessionFresh === "voyage"
            ? "voyage"
            : params.get("mode") === "invitation"
              ? "invitation"
              : "voyage";
      consumeStartFresh();
      await resetProject({
        mode,
        statusMsg: "Started fresh",
        keepThemeId: paramTheme.id,
      });
      if (cancelled) return;
      const next = new URLSearchParams(params);
      next.delete("fresh");
      if (mode === "invitation") next.set("mode", "invitation");
      else next.delete("mode");
      next.delete("template");
      setSearchParams(next, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("fresh"), hydrated, params.get("mode")]);

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
    ai.begin("export");
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
          inSec: c.inSec,
          transitionSpec: c.transitionSpec,
          animation: animFor(c),
          keyframes: c.keyframes,
          speed: c.speed,
          reverse: c.reverse,
          mute: c.mute,
        })),
        grade: effectiveGrade,
        transitionSpec: projectTxSpec,
        audioClips: resolvedAudio,
        ducks,
        duckLevel: 0.3,
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
        burnTitle: false,
        mode: projectMode,
        invitation:
          projectMode === "invitation"
            ? {
                hostName: hostName.trim() || undefined,
                guestName: guestName.trim() || undefined,
                eventName: eventName.trim() || undefined,
                eventType: eventType.trim() || undefined,
                eventWhen: eventWhen.trim() || undefined,
                eventWhere: eventWhere.trim() || undefined,
              }
            : undefined,
        audio: audioOpts,
        onProgress: (p) => {
          setExportProgress(p);
          setStatus(p.message);
        },
        signal: ac.signal,
      });
      const name = exportFilename(title, preset, result.extension);
      downloadBlob(result.blob, name);
      setLastExport({
        blob: result.blob,
        filename: name,
        mimeType: result.mimeType,
        shareId,
        title: title.trim() || (projectMode === "invitation" ? "You're invited!" : "Untitled voyage"),
        createdAt: Date.now(),
        kind: "video",
      });
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
      ai.end();
    }
  };


  const exportGif = async (opts?: { maxWidth?: number }) => {
    if (clips.length === 0 || exporting) return null;
    stopPreview();
    setPlaying(false);
    clearAdvanceTimer();

    const ac = new AbortController();
    exportAbortRef.current = ac;
    setExporting(true);
    ai.begin("export");
    setExportProgress({
      phase: "prepare",
      ratio: 0,
      clipIndex: 0,
      clipCount: clips.length,
      message: "Preparing GIF…",
    });
    setStatus("Exporting GIF…");

    try {
      const result = await exportSlideshowGif({
        clips: clips.map((c) => ({
          id: c.id,
          kind: c.kind,
          objectUrl: c.objectUrl,
          fileName: c.fileName,
          durationSec: c.durationSec,
          transitionOut: c.transitionOut,
          inSec: c.inSec,
          transitionSpec: c.transitionSpec,
          animation: animFor(c),
          keyframes: c.keyframes,
          speed: c.speed,
          reverse: c.reverse,
          mute: c.mute,
        })),
        grade: effectiveGrade,
        transitionSpec: projectTxSpec,
        audioClips: resolvedAudio,
        ducks,
        duckLevel: 0.3,
        theme,
        title,
        aspect,
        transition: globalTransition,
        textOverlays,
        captionText,
        captionStyle,
        textStyle,
        watermark,
        burnTitle: false,
        mode: projectMode,
        invitation:
          projectMode === "invitation"
            ? {
                hostName: hostName.trim() || undefined,
                guestName: guestName.trim() || undefined,
                eventName: eventName.trim() || undefined,
                eventType: eventType.trim() || undefined,
                eventWhen: eventWhen.trim() || undefined,
                eventWhere: eventWhere.trim() || undefined,
              }
            : undefined,
        maxWidth: opts?.maxWidth ?? 720,
        preferFormat: "gif",
        onProgress: (p) => {
          setExportProgress(p);
          setStatus(p.message);
        },
        signal: ac.signal,
      });
      const name = filenameFromTitleGif(title, result.extension);
      downloadBlob(result.blob, name);
      setLastExport({
        blob: result.blob,
        filename: name,
        mimeType: result.mimeType,
        shareId,
        title: title.trim() || (projectMode === "invitation" ? "You're invited!" : "Untitled voyage"),
        createdAt: Date.now(),
        kind: result.extension === "webp" ? "webp" : "gif",
      });
      const trimNote = result.trimmed ? " · trimmed long voyage" : "";
      const skipNote =
        result.skippedVideos.length > 0
          ? ` · skipped ${result.skippedVideos.length} video clip(s)`
          : "";
      const shareFile = blobToShareFile(result.blob, name);
      const shareHint = canShareMediaFile(shareFile)
        ? " · tip: WhatsApp / system share can attach this GIF"
        : "";
      setStatus(
        `Downloaded ${name} (${result.sizeNote})${trimNote}${skipNote}${shareHint}`,
      );
      return { blob: result.blob, filename: name, mimeType: result.mimeType };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("Export cancelled");
      } else {
        const msg = err instanceof Error ? err.message : "GIF export failed";
        setStatus(msg);
      }
      return null;
    } finally {
      exportAbortRef.current = null;
      setExporting(false);
      setExportProgress(null);
      ai.end();
    }
  };

  const downloadProjectJson = () => {
    const draft: DraftState = {
      title,
      mode: projectMode,
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
      hostName,
      guestName,
      eventName,
      eventType,
      eventWhen,
      eventWhere,
      clips: clips.map(toClipMeta),
      textOverlays,
      customSounds,
      audioMixMode,
      transitionOverride,
      grade,
      defaultAnimation,
      transitionSpec: projectTxSpec,
      audioClips,
      autoDuck,
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
      mode: projectMode,
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
      hostName,
      guestName,
      eventName,
      eventType,
      eventWhen,
      eventWhere,
      clips: clips.map(toClipMeta),
      textOverlays,
      customSounds,
      audioMixMode,
      transitionOverride,
      grade,
      defaultAnimation,
      transitionSpec: projectTxSpec,
      audioClips,
      autoDuck,
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

  const shareToWhatsApp = async () => {
    const draft: DraftState = {
      title,
      mode: projectMode,
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
      hostName,
      guestName,
      eventName,
      eventType,
      eventWhen,
      eventWhere,
      clips: clips.map(toClipMeta),
      textOverlays,
      customSounds,
      audioMixMode,
      transitionOverride,
      grade,
      defaultAnimation,
      transitionSpec: projectTxSpec,
      audioClips,
      autoDuck,
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

    setStatus("Preparing shareable link…");
    let shareUrl = publicShareUrl(share.id);
    let portable = false;
    try {
      const built = await buildPortableShareUrl(share, {
        onProgress: (msg) => setStatus(msg),
      });
      shareUrl = built.url;
      portable = true;
      setStatus(built.status);
    } catch {
      setStatus("Could not embed media — sharing local link; prefer Export video.");
    }

    const displayTitle =
      title.trim() || (projectMode === "invitation" ? "You're invited!" : "Untitled voyage");

    // Prefer GIF for WhatsApp try-out (lighter than video); fall back to video.
    let exp = getLastGifExport(share.id) ?? getLastGifExport();
    const lastAny = getLastExport(share.id) ?? getLastExport();
    if (
      !exp &&
      lastAny &&
      (lastAny.kind === "gif" || lastAny.kind === "webp" || lastAny.mimeType.startsWith("image/"))
    ) {
      exp = lastAny;
    }
    if (!exp && lastAny && lastAny.kind === "video" && lastAny.blob.size <= VIDEO_HEAVY_BYTES) {
      exp = lastAny;
    } else if (
      !exp &&
      lastAny &&
      lastAny.kind === "video" &&
      lastAny.blob.size > VIDEO_HEAVY_BYTES
    ) {
      setStatus("Video is heavy — exporting a lighter GIF for WhatsApp…");
      const gifOut = await exportGif();
      if (gifOut) {
        exp = {
          blob: gifOut.blob,
          filename: gifOut.filename,
          mimeType: gifOut.mimeType,
          shareId: share.id,
          title: displayTitle,
          createdAt: Date.now(),
          kind: "gif",
        };
      } else {
        exp = lastAny;
      }
    }
    if (!exp) {
      setStatus("Exporting GIF for WhatsApp (lighter than video)…");
      const gifOut = await exportGif();
      if (gifOut) {
        exp = {
          blob: gifOut.blob,
          filename: gifOut.filename,
          mimeType: gifOut.mimeType,
          shareId: share.id,
          title: displayTitle,
          createdAt: Date.now(),
          kind: "gif",
        };
      }
    }

    const file = exp ? blobToShareFile(exp.blob, exp.filename) : null;
    const isImage =
      !!exp &&
      (exp.kind === "gif" ||
        exp.kind === "webp" ||
        exp.mimeType.startsWith("image/"));
    const textMsg = buildWhatsAppInviteText({
      title: displayTitle,
      shareUrl,
      isInvitation: projectMode === "invitation",
      attachHint: !file,
      portable,
    });

    if (!file) {
      setStatus(
        portable
          ? "Link embeds photos — Export GIF or video, then Share to WhatsApp again to attach the file."
          : "Tip: Export GIF (lighter) or video, then Share to WhatsApp — friends need the file.",
      );
    }

    const result = await shareInviteToWhatsApp({
      title: displayTitle,
      text: textMsg,
      file,
    });

    if (result === "shared-file") {
      setStatus(
        isImage
          ? "Shared GIF via system share — pick WhatsApp"
          : "Shared video via system share — pick WhatsApp",
      );
    } else if (result === "whatsapp-text") {
      if (exp) downloadBlob(exp.blob, exp.filename);
      setStatus(
        exp
          ? isImage
            ? "Opened WhatsApp — attach the GIF you just downloaded"
            : "Opened WhatsApp — attach the video you just downloaded"
          : "Opened WhatsApp with invite text — Export GIF then attach for your friend",
      );
    } else if (result === "aborted") {
      setStatus("Share cancelled");
    } else {
      setStatus("Could not open WhatsApp share");
    }
  };

  const runStoryCoach = () => {
    ai.pulse("coach", 1600);
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


  // ───────────── v2 timeline editor ─────────────
  const layer = useMemo(() => themeLayer(theme), [theme]);
  const effectiveGrade: GradePreset = grade ?? layer.grade;
  const effectiveAnim: ClipAnimation = defaultAnimation ?? layer.animation;
  const gradeCss = gradeFilter(effectiveGrade);
  const animFor = useCallback(
    (c: { kind: "image" | "video"; animation?: ClipAnimation }): ClipAnimation | undefined =>
      c.animation ?? (c.kind === "image" ? effectiveAnim : { ...effectiveAnim, emphasis: undefined }),
    [effectiveAnim],
  );
  const starts = layout.starts;

  // ───────── audio track (v3) ─────────
  const autoDuckOn = autoDuck ?? ducking;
  const effAudio = useMemo(
    () =>
      effectiveAudioClips(
        { track: audioTrackRef, mixMode: audioMixMode, ducking, clips: audioClips },
        totalDuration,
        selectedBeat.packRef,
      ),
    [audioTrackRef, audioMixMode, ducking, audioClips, totalDuration, selectedBeat.packRef],
  );
  const audioUrlFor = useCallback(
    (ref: string): string | undefined => {
      if (isCustomTrackRef(ref)) {
        const id = customIdFromTrackRef(ref);
        return id ? customSoundUrls[id] || customSounds.find((x) => x.id === id)?.url : undefined;
      }
      return getBeatByRef(ref)?.previewUrl;
    },
    [customSoundUrls, customSounds],
  );
  const audioLabelFor = useCallback(
    (ref: string) =>
      isCustomTrackRef(ref)
        ? customSounds.find((x) => x.id === customIdFromTrackRef(ref))?.name ?? "Custom sound"
        : getBeatByRef(ref)?.name ?? ref,
    [customSounds],
  );
  const resolvedAudio: ResolvedAudioClip[] = useMemo(
    () => effAudio.map((a) => ({ ...a, url: audioUrlFor(a.ref) })),
    [effAudio, audioUrlFor],
  );
  const ducks = useMemo(
    () => (autoDuckOn ? duckWindows(clips, layout) : []),
    [autoDuckOn, clips, layout],
  );
  /** First edit of the audio track turns the implicit bed into real clips. */
  const editAudio = useCallback(
    (fn: (list: AudioClip[]) => AudioClip[]) => {
      setAudioClips((prev) => fn(prev ?? effAudio.map((a) => ({ ...a, label: audioLabelFor(a.ref) }))));
    },
    [effAudio, audioLabelFor],
  );
  const patchAudio = useCallback(
    (id: string, patch: Partial<AudioClip>) => editAudio((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a))),
    [editAudio],
  );

  // Synced preview audio while the timeline plays
  const audioPlayerRef = useRef<TimelineAudioPlayer | null>(null);
  const playheadRef = useRef(0);
  playheadRef.current = (layout.starts[activeIndex] ?? 0) + elapsed;
  const audioKey = JSON.stringify([resolvedAudio.map((a) => [a.url, a.at, a.inSec, a.durationSec, a.volume, a.fadeInSec, a.fadeOutSec, a.loop]), ducks]);
  useEffect(() => {
    if (!audioPlayerRef.current) audioPlayerRef.current = new TimelineAudioPlayer();
    const pl = audioPlayerRef.current;
    if (!playing) {
      pl.stop();
      return;
    }
    previewHandle.current?.stop();
    previewHandle.current = null;
    void pl.play(resolvedAudio, playheadRef.current, ducks, 0.3);
    return () => pl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, audioKey]);
  // Restart audio when playback wraps back to the start
  const wrapRef = useRef(activeIndex);
  useEffect(() => {
    if (playing && activeIndex === 0 && wrapRef.current !== 0 && clips.length > 1) {
      void audioPlayerRef.current?.play(resolvedAudio, 0, ducks, 0.3);
    }
    wrapRef.current = activeIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);
  useEffect(() => () => audioPlayerRef.current?.stop(), []);

  const selAudio =
    selection?.type === "audio" && selection.id ? effAudio.find((a) => a.id === selection.id) : undefined;

  const addAudioAtPlayhead = useCallback(() => {
    const at = Math.round(((layout.starts[activeIndex] ?? 0) + elapsed) * 100) / 100;
    const id = `aud-${Math.random().toString(36).slice(2, 8)}`;
    const dur = Math.max(2, Math.min(8, Math.max(2, totalDuration - at)));
    editAudio((l) => [
      ...l,
      { id, ref: audioTrackRef, at, durationSec: Math.round(dur * 100) / 100, volume: 0.8, fadeInSec: 0.3, fadeOutSec: 0.6, loop: true, label: audioLabelFor(audioTrackRef) },
    ]);
    setSelection({ type: "audio", id });
    setInspectorOpen(true);
  }, [layout, activeIndex, elapsed, totalDuration, editAudio, audioTrackRef, audioLabelFor]);

  const snapshot: EditorSnapshot = useMemo(
    () => ({
      clips,
      textOverlays,
      themeId,
      templateId,
      transitionOverride,
      grade,
      defaultAnimation,
      projectTxSpec,
      textStyle,
      textTransition,
      audioTrackRef,
      beatSync,
      aspect,
      audioClips,
      autoDuck,
    }),
    [clips, textOverlays, themeId, templateId, transitionOverride, grade, defaultAnimation, projectTxSpec, textStyle, textTransition, audioTrackRef, beatSync, aspect, audioClips, autoDuck],
  );
  const history = useHistory<EditorSnapshot>(
    snapshot,
    (sn) => {
      setClips(sn.clips);
      setTextOverlays(sn.textOverlays);
      setThemeId(sn.themeId);
      setTemplateId(sn.templateId);
      setTransitionOverride(sn.transitionOverride);
      setGrade(sn.grade);
      setDefaultAnimation(sn.defaultAnimation);
      setProjectTxSpec(sn.projectTxSpec);
      setTextStyle(sn.textStyle);
      setTextTransition(sn.textTransition);
      setAudioTrackRef(sn.audioTrackRef);
      setBeatSync(sn.beatSync);
      setAspect(sn.aspect);
      setAudioClips(sn.audioClips);
      setAutoDuck(sn.autoDuck);
      setActiveIndex((ai) => Math.min(ai, Math.max(0, sn.clips.length - 1)));
    },
    hydrated,
  );
  historyRef.current = history;

  const doUndo = useCallback(() => {
    if (history.undo()) setCoachHint("Undo");
  }, [history]);
  const doRedo = useCallback(() => {
    if (history.redo()) setCoachHint("Redo");
  }, [history]);

  const seekTo = useCallback(
    (t: number) => {
      if (clips.length === 0) return;
      setPlaying(false);
      const f = framesAt(layout, clips, t);
      setActiveIndex(f.index);
      setElapsed(f.local);
    },
    [clips, layout],
  );

  // Paused scrubbing drives the video frame
  useEffect(() => {
    if (playing) return;
    const clip = clips[activeIndex];
    const el = videoRef.current;
    if (!clip || clip.kind !== "video" || !el) return;
    const want = sourceTimeAt(clip, elapsed);
    if (Math.abs(el.currentTime - want) > 0.05) el.currentTime = want;
  }, [elapsed, playing, activeIndex, clips]);

  const patchClip = useCallback((id: string, patch: Partial<LiveClip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);
  const patchText = useCallback((id: string, patch: Partial<DraftTextOverlay>) => {
    setTextOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  const onTrimClip = useCallback(
    (id: string, next: { durationSec: number; inSec?: number }, origin: { durationSec: number; inSec: number }) => {
      setClips((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          if (c.kind === "image") {
            const d = next.inSec !== undefined ? next.durationSec : next.durationSec;
            return { ...c, durationSec: Math.round(Math.min(60, Math.max(0.3, d)) * 100) / 100 };
          }
          const sp = clampSpeed(c.speed);
          const source = c.sourceSec ?? origin.inSec + origin.durationSec * sp;
          const inSec = Math.max(0, Math.min(source - 0.3, next.inSec ?? c.inSec ?? 0));
          const dur = Math.max(0.3, Math.min((source - inSec) / sp, next.durationSec));
          return {
            ...c,
            sourceSec: source,
            inSec: Math.round(inSec * 100) / 100 || undefined,
            durationSec: Math.round(dur * 100) / 100,
          };
        }),
      );
    },
    [],
  );

  const reorderClip = useCallback(
    (from: number, to: number) => {
      setClips((prev) => {
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      });
      setActiveIndex(to);
      setElapsed(0);
      setCoachHint(`Moved clip ${from + 1} → ${to + 1}`);
    },
    [],
  );

  const playhead = trackElapsed;

  const selectedClipIndex =
    selection?.type === "clip" ? clips.findIndex((c) => c.id === selection.id) : -1;
  const selClip = selectedClipIndex >= 0 ? clips[selectedClipIndex] : undefined;
  const selText =
    selection?.type === "text" ? textOverlays.find((o) => o.id === selection.id) : undefined;
  const selGap = selection?.type === "gap" && selection.index < clips.length - 1 ? selection.index : -1;

  const clipLocal = (index: number) =>
    Math.max(0, Math.min(clips[index]?.durationSec ?? 0, playhead - (starts[index] ?? 0)));
  const textLocal = (o: DraftTextOverlay) => Math.max(0, Math.min(o.end - o.at, playhead - o.at));

  const copyBlob = useCallback(async (fromId: string, toId: string) => {
    try {
      const blob = await getBlob(fromId);
      if (blob) await putBlob(toId, blob);
    } catch {
      /* media stays in memory for this session */
    }
  }, []);

  const splitAtPlayhead = useCallback(() => {
    if (selAudio) {
      const t = (layout.starts[activeIndex] ?? 0) + elapsed;
      const local = t - selAudio.at;
      if (local < 0.2 || local > selAudio.durationSec - 0.2) {
        setCoachHint("Move the playhead inside the audio clip to split");
        return;
      }
      const id = `aud-${Math.random().toString(36).slice(2, 8)}`;
      editAudio((l) =>
        l.flatMap((a) =>
          a.id !== selAudio.id
            ? [a]
            : [
                { ...a, durationSec: Math.round(local * 100) / 100, fadeOutSec: 0 },
                { ...a, id, at: Math.round(t * 100) / 100, inSec: Math.round(((a.inSec ?? 0) + local) * 100) / 100, durationSec: Math.round((a.durationSec - local) * 100) / 100, fadeInSec: 0 },
              ],
        ),
      );
      setSelection({ type: "audio", id });
      setCoachHint("Split audio at playhead");
      return;
    }
    const idx = activeIndex;
    const c = clips[idx];
    if (!c) return;
    const local = elapsed;
    if (local < 0.2 || local > c.durationSec - 0.2) {
      setCoachHint("Move the playhead inside a clip to split");
      return;
    }
    const newId = newClipId();
    void copyBlob(c.id, newId);
    const keys = c.keyframes ?? [];
    const first: LiveClip = {
      ...c,
      durationSec: Math.round(local * 100) / 100,
      transitionOut: "cut",
      transitionSpec: undefined,
      keyframes: keys.filter((k) => k.t <= local),
      animation: c.animation ? { ...c.animation, out: undefined } : undefined,
    };
    const second: LiveClip = {
      ...c,
      id: newId,
      inSec: c.kind === "video" ? Math.round(sourceTimeAt(c, local) * 100) / 100 : undefined,
      durationSec: Math.round((c.durationSec - local) * 100) / 100,
      keyframes: keys.filter((k) => k.t > local).map((k) => ({ ...k, t: Math.round((k.t - local) * 100) / 100 })),
      animation: c.animation ? { ...c.animation, in: undefined } : undefined,
    };
    setClips((prev) => [...prev.slice(0, idx), first, second, ...prev.slice(idx + 1)]);
    setSelection({ type: "clip", id: newId });
    setActiveIndex(idx + 1);
    setElapsed(0);
    setCoachHint("Split at playhead");
  }, [activeIndex, clips, elapsed, copyBlob, selAudio, layout, editAudio]);

  const duplicateSelected = useCallback(() => {
    if (selAudio) {
      const id = `aud-${Math.random().toString(36).slice(2, 8)}`;
      editAudio((l) => [...l, { ...selAudio, id, at: Math.round((selAudio.at + selAudio.durationSec) * 100) / 100 }]);
      setSelection({ type: "audio", id });
      setCoachHint("Duplicated audio");
      return;
    }
    if (selClip) {
      const newId = newClipId();
      void copyBlob(selClip.id, newId);
      const copy: LiveClip = { ...selClip, id: newId };
      setClips((prev) => {
        const i = prev.findIndex((c) => c.id === selClip.id);
        return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
      });
      setSelection({ type: "clip", id: newId });
      setCoachHint("Duplicated clip");
    } else if (selText) {
      const len = selText.end - selText.at;
      const copy: DraftTextOverlay = { ...selText, id: newClipId(), at: selText.end, end: selText.end + len };
      setTextOverlays((prev) => [...prev, copy]);
      setSelection({ type: "text", id: copy.id });
      setCoachHint("Duplicated text");
    }
  }, [selClip, selText, copyBlob, selAudio, editAudio]);

  const deleteSelected = useCallback(() => {
    if (selAudio) {
      editAudio((l) => l.filter((a) => a.id !== selAudio.id));
      setSelection(null);
      setCoachHint("Audio clip deleted · Ctrl/Cmd+Z to undo");
      return;
    }
    if (selClip) {
      // Keep blob + URL alive so Undo can bring the clip back.
      setClips((prev) => prev.filter((c) => c.id !== selClip.id));
      setActiveIndex((ai) => Math.max(0, Math.min(ai, clips.length - 2)));
      setElapsed(0);
      setSelection(null);
      setCoachHint("Clip deleted · Ctrl/Cmd+Z to undo");
    } else if (selText) {
      setTextOverlays((prev) => prev.filter((o) => o.id !== selText.id));
      setSelection(null);
      setCoachHint("Text deleted · Ctrl/Cmd+Z to undo");
    } else if (selGap >= 0) {
      const id = clips[selGap].id;
      patchClip(id, { transitionOut: null, transitionSpec: undefined });
      setCoachHint("Transition reset to theme default");
    }
  }, [selClip, selText, selGap, clips, patchClip, selAudio, editAudio]);

  const addKeyframeAtPlayhead = useCallback(() => {
    if (selClip) {
      const t = clipLocal(selectedClipIndex);
      const cur = keyframesAtSafe(selClip.keyframes, t);
      patchClip(selClip.id, { keyframes: upsertKeyframe(selClip.keyframes, t, cur) });
      setCoachHint(`◆ Keyframe @ ${t.toFixed(2)}s`);
    } else if (selText) {
      const t = textLocal(selText);
      const cur = keyframesAtSafe(selText.keyframes, t);
      patchText(selText.id, { keyframes: upsertKeyframe(selText.keyframes, t, cur) });
      setCoachHint(`◆ Keyframe @ ${t.toFixed(2)}s`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selClip, selText, selectedClipIndex, playhead, patchClip, patchText]);

  const setGapSpec = useCallback(
    (index: number, spec: TransitionSpec) => {
      const id = clips[index]?.id;
      if (id) patchClip(id, { transitionSpec: spec });
    },
    [clips, patchClip],
  );

  const applyGapToAll = useCallback(
    (index: number) => {
      const src = clips[index];
      if (!src) return;
      setClips((prev) =>
        prev.map((c, i) =>
          i < prev.length - 1 ? { ...c, transitionOut: src.transitionOut ?? null, transitionSpec: src.transitionSpec } : c,
        ),
      );
      setCoachHint(`Applied ${transitionLabel(src.transitionOut ?? globalTransition)} to all gaps`);
    },
    [clips, globalTransition],
  );

  const randomGap = useCallback(
    (index: number) => {
      const pool = TRANSITIONS.filter((k) => k !== "cut" && k !== clips[index]?.transitionOut);
      const k = pool[Math.floor(Math.random() * pool.length)];
      if (k) setGapTransition(index, k);
    },
    [clips, setGapTransition],
  );

  const addTextAtPlayhead = useCallback(() => {
    const at = Math.round(playhead * 100) / 100;
    const end = Math.min(Math.max(totalDuration, at + 0.5), at + 3);
    const o = { ...defaultTextOverlay(at, end, "New text"), animation: { in: "pop" as const, out: "fade" as const } };
    setTextOverlays((prev) => [...prev, o]);
    setSelection({ type: "text", id: o.id });
    setInspectorOpen(true);
  }, [playhead, totalDuration]);

  // Keyboard shortcuts (pro-editor muscle memory)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (mod && k === "y") {
        e.preventDefault();
        doRedo();
      } else if (mod && k === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (mod) {
        return;
      } else if (k === " " && clips.length) {
        e.preventDefault();
        setPlaying((pl) => !pl);
      } else if (k === "s") {
        splitAtPlayhead();
      } else if (k === "k") {
        addKeyframeAtPlayhead();
      } else if (k === "delete" || k === "backspace") {
        if (selection) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (k === "arrowleft" || k === "arrowright") {
        if (!clips.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        seekTo(Math.max(0, Math.min(totalDuration, playhead + (k === "arrowleft" ? -step : step))));
      } else if (k === "escape") {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo, duplicateSelected, splitAtPlayhead, addKeyframeAtPlayhead, deleteSelected, seekTo, selection, clips.length, totalDuration, playhead]);

  // Applied chip fades quietly
  useEffect(() => {
    if (!appliedChip) return;
    const id = window.setTimeout(() => setAppliedChip(null), 9000);
    return () => window.clearTimeout(id);
  }, [appliedChip]);

  const activeTxSec = activeIndex > 0 ? layout.tx[activeIndex - 1] ?? 0 : 0;
  const prevIdx = activeIndex > 0 && elapsed < activeTxSec ? activeIndex - 1 : -1;
  const prevClip = prevIdx >= 0 ? clips[prevIdx] : undefined;
  const activeTxEasing = transitionEasingInto(clips, activeIndex, projectTxSpec);

  const active = clips[activeIndex];
  const transitionClass =
    playing || elapsed < activeTxSec + 0.05 ? `tx-${activeTransition}` : "";
  // Ken Burns now comes from the theme layer animation (AnimatedLayer)
  const kenBurns = "";

  return (
    <div className={`compose-root${minimalist ? " is-minimalist" : ""}`}>
      <div className="compose-header">
        <div className="compose-header-main">
          <h1 className="display compose-title">
            {projectMode === "invitation" ? "Compose · Invitation" : "Compose · Auto"}
          </h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
            {projectMode === "invitation"
              ? "Design an animated invite — guests open the link for fullscreen playback (same theme, transitions, audio & text)."
              : "Every voyage, in motion — drop photos or clips, pick a theme, play."}
          </p>
          <div className="compose-mode-row">
            <span className="muted compose-mode-label">
              Mode
            </span>
          <div className="mode-toggle" role="group" aria-label="Project mode">
            <button
              type="button"
              className={projectMode === "voyage" ? "is-active" : undefined}
              onClick={() => {
                setProjectMode("voyage");
                syncModeInUrl("voyage");
                setStatus("Mode · Voyage story");
              }}
            >
              Voyage
            </button>
            <button
              type="button"
              className={projectMode === "invitation" ? "is-active" : undefined}
              onClick={() => {
                setProjectMode("invitation");
                syncModeInUrl("invitation");
                setTitle((prev) =>
                  !prev || prev === "Untitled voyage" ? "You're invited!" : prev,
                );
                const first = getInvitationTemplates()[0];
                if (first && !templateId) applyTemplate(first);
                setStatus("Mode · Invitation (guest playback share)");
              }}
            >
              Invitation
            </button>
          </div>
          </div>
          <div className="title-emoji-row">
            <input
              className="compose-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Project title"
              placeholder={projectMode === "invitation" ? "You're invited! 🎉" : "Untitled voyage ✨"}
            />
            <EmojiPicker onSelect={(emoji) => setTitle((t) => t + emoji)} />
          </div>
        </div>
        <div className="compose-actions">
          <button type="button" className="btn btn-ghost" onClick={downloadProjectJson}>
            Export JSON
          </button>
          <button
            type="button"
            className={`btn btn-ghost${exporting || ai.kind === "export" ? " is-pulsing" : ""}`}
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
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void shareToWhatsApp()}
            title="Share invite via WhatsApp (prefers GIF when available; lighter than video)"
          >
            WhatsApp
          </button>
        </div>
      </div>

      {minimalist && (
        <div className="mini-icon-rail" role="toolbar" aria-label="Compose tools">
          <button
            type="button"
            className="icon-tool"
            title="Add media — photos, video, Voyajes library"
            aria-label="Add media"
            onClick={() => {
              setMediaImporterMode("all");
              setMediaImporterOpen(true);
            }}
          >
            <span aria-hidden>＋</span>
            <span className="icon-tool-tip">Media</span>
          </button>
          <button
            type="button"
            className={`icon-tool${miniSheet === "theme" ? " is-on" : ""}`}
            title="Theme, templates, transitions"
            aria-label="Theme & templates"
            onClick={() => setMiniSheet((s) => (s === "theme" ? null : "theme"))}
          >
            <span aria-hidden>🎨</span>
            <span className="icon-tool-tip">Theme</span>
          </button>
          <button
            type="button"
            className={`icon-tool${miniSheet === "audio" ? " is-on" : ""}`}
            title="Beats & soundtrack"
            aria-label="Audio"
            onClick={() => setMiniSheet((s) => (s === "audio" ? null : "audio"))}
          >
            <span aria-hidden>♪</span>
            <span className="icon-tool-tip">Audio</span>
          </button>
          <button
            type="button"
            className={`icon-tool${miniSheet === "text" ? " is-on" : ""}`}
            title="Text & captions"
            aria-label="Text"
            onClick={() => setMiniSheet((s) => (s === "text" ? null : "text"))}
          >
            <span aria-hidden>𝐓</span>
            <span className="icon-tool-tip">Text</span>
          </button>
          <button
            type="button"
            className="icon-tool"
            title="Export presets & WebM"
            aria-label="Export"
            onClick={() => setExportPanelOpen((o) => !o)}
          >
            <span aria-hidden>⇩</span>
            <span className="icon-tool-tip">Export</span>
          </button>
          <button
            type="button"
            className="icon-tool"
            title="Share voyage / invite"
            aria-label="Share"
            onClick={openShare}
          >
            <span aria-hidden>↗</span>
            <span className="icon-tool-tip">Share</span>
          </button>
          <button
            type="button"
            className="icon-tool"
            title="Story coach"
            aria-label="Story coach"
            onClick={runStoryCoach}
          >
            <span aria-hidden>✨</span>
            <span className="icon-tool-tip">Coach</span>
          </button>
        </div>
      )}

      <div
        className={`human-help-bar${ai.kind === "coach" || ai.kind === "template" ? " is-ai-assist" : ""}`}
        aria-label="Story coach and tools"
      >
        <button
          type="button"
          className={`btn btn-ghost ai-assist-btn${ai.kind === "coach" ? " is-pulsing" : ""}`}
          onClick={runStoryCoach}
          title="Suggest title and caption from theme + clips"
        >
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
          <span
            className={`muted coach-hint${ai.kind === "coach" ? " ai-shimmer" : ""}`}
            style={{ fontSize: "0.8rem" }}
            role="status"
          >
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

      <div className="compose-meta-chips">
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
                      ? "Watermark on · Voyajes logo on export"
                      : "Watermark off",
                  );
                }}
              />
              <span>
                Watermark
                <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                  Places the Voyajes logo softly in the corner
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
            <button
              type="button"
              className="btn btn-ghost"
              disabled={clips.length === 0 || exporting}
              title={GIF_SIZE_HINT}
              onClick={() => void exportGif()}
            >
              Export GIF
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={clips.length === 0 || exporting}
              title="Export GIF if needed, then open system share (image/gif when supported)"
              onClick={() => {
                void (async () => {
                  let exp = getLastGifExport(shareId) ?? getLastGifExport();
                  if (!exp || (shareId && exp.shareId && exp.shareId !== shareId)) {
                    const out = await exportGif();
                    if (!out) return;
                    exp = {
                      blob: out.blob,
                      filename: out.filename,
                      mimeType: out.mimeType,
                      shareId,
                      title: title.trim() || "Voyajes GIF",
                      createdAt: Date.now(),
                      kind: "gif",
                    };
                  }
                  const file = blobToShareFile(exp.blob, exp.filename);
                  if (canShareMediaFile(file)) {
                    try {
                      await navigator.share({
                        files: [file],
                        title: exp.title,
                        text: "Voyajes GIF",
                      });
                      setStatus("Shared GIF via system share");
                    } catch (err) {
                      if (err instanceof DOMException && err.name === "AbortError") {
                        setStatus("Share cancelled");
                      } else {
                        downloadBlob(exp.blob, exp.filename);
                        setStatus("Share not available — GIF downloaded instead");
                      }
                    }
                  } else {
                    downloadBlob(exp.blob, exp.filename);
                    setStatus("Web Share not available for images here — GIF downloaded");
                  }
                })();
              }}
            >
              Share GIF
            </button>
            {exporting && (
              <button type="button" className="btn btn-ghost" onClick={cancelExport}>
                Cancel
              </button>
            )}
          </div>
          <p className="muted" style={{ fontSize: "0.75rem", margin: "8px 0 0" }}>
            {GIF_SIZE_HINT}. Prefer GIF for WhatsApp / friend try-out when video feels heavy.
          </p>
        </div>
      )}

      <div className="compose-layout">
        <div>
          <div
            className={`dropzone${dragOver ? " drag-over" : ""}${minimalist ? " dropzone-mini" : ""}`}
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
              title="Open media picker — device or Voyajes library"
              aria-label="Add media"
              onClick={() => {
                setMediaImporterMode("all");
                setMediaImporterOpen(true);
              }}
            >
              {minimalist ? "＋ Add media" : "Add media"}
            </button>
            {!minimalist && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "8px 14px" }}
                onClick={() => fileInputRef.current?.click()}
                title="Quick pick from device"
              >
                From device
              </button>
            )}
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {minimalist
                ? "Device · Voyajes library · drop files here"
                : "Device or Voyajes library · or drag & drop · JPG, PNG, WebP, MP4, WebM"}
            </span>
          </div>

          <div className="preview-stage-wrap" style={{ marginTop: 16, width: "100%" }}>
          <div
            className="preview-stage"
            style={{
              aspectRatio: aspectCss(aspect),
              width: aspect === "9:16" || aspect === "4:5" ? "min(100%, 360px)" : "100%",
              maxHeight: aspect === "9:16" || aspect === "4:5" ? "70vh" : 420,
              background:
                !active && projectMode === "invitation"
                  ? theme.gradient
                  : undefined,
            }}
          >
            {transitionFlash && (
              <div className="tx-hud-badge" key={transitionFlash.token} aria-live="polite">
                <span className="tx-hud-icon" aria-hidden>
                  {transitionIcon(transitionFlash.kind)}
                </span>
                <span>{transitionLabel(transitionFlash.kind)}</span>
              </div>
            )}
            {active && prevClip && (
              <div key={`prev-${prevClip.id}`} className="preview-media preview-media-under">
                <AnimatedLayer
                  animation={animFor(prevClip)}
                  keyframes={prevClip.keyframes}
                  durationSec={prevClip.durationSec}
                  localSec={prevClip.durationSec - activeTxSec + elapsed}
                  playing={playing}
                  reverse={prevClip.reverse}
                  resetKey={`prev-${prevClip.id}`}
                  filter={gradeCss}
                >
                  {prevClip.kind === "image" ? (
                    <img src={prevClip.objectUrl} alt="" draggable={false} />
                  ) : (
                    <video
                      src={prevClip.objectUrl}
                      muted
                      playsInline
                      autoPlay={playing}
                      onLoadedMetadata={(e) => {
                        e.currentTarget.playbackRate = clampSpeed(prevClip.speed);
                        e.currentTarget.currentTime = sourceTimeAt(prevClip, prevClip.durationSec - activeTxSec + elapsedRef.current);
                      }}
                    />
                  )}
                </AnimatedLayer>
              </div>
            )}
            {active ? (
              <div
                key={`${active.id}-${transitionKey}`}
                className={`preview-media ${transitionClass} ${kenBurns}`}
                style={
                  {
                    "--tx-ms": `${Math.round(Math.max(0.05, activeTxSec) * 1000)}ms`,
                    ...(playing
                      ? {}
                      : { animationDelay: `-${elapsed.toFixed(3)}s`, animationPlayState: "paused" }),
                    "--tx-ease": activeTxEasing
                      ? easingCss(activeTxEasing)
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
                  localSec={elapsed}
                  playing={playing}
                  reverse={active.reverse}
                  resetKey={`${active.id}-${transitionKey}`}
                  filter={gradeCss}
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
                      onLoadedMetadata={(e) => {
                        e.currentTarget.playbackRate = clampSpeed(active.speed);
                        e.currentTarget.currentTime = sourceTimeAt(active, elapsedRef.current);
                      }}
                    />
                  )}
                </AnimatedLayer>
              </div>
            ) : projectMode === "invitation" ? (
              <>
                <div className="invite-stage-watermark" aria-hidden>
                  {(templateId && getTemplateById(templateId)?.eventEmoji) ||
                    (eventType ? "✉️" : "🎉")}
                </div>
                <div className="invite-stage-empty-copy">
                  <div className="display" style={{ fontSize: "1.1rem", opacity: 0.95 }}>
                    {title.trim() || "You're invited!"}
                  </div>
                  <div className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                    {theme.name} backdrop · import photos to fill the invite
                  </div>
                </div>
              </>
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
                opacity: active ? 0.45 : projectMode === "invitation" ? 0.35 : 0.55,
              }}
            />
            <div
              className="grade grade-vignette"
              style={{
                background: `radial-gradient(ellipse at center, transparent 40%, ${theme.palette.bg}cc 100%)`,
                opacity: active ? 0.7 : 0.4,
              }}
            />

            {/* Timed text overlays only — title/meta live in chrome below, not on pixels */}
            {activeOverlays.map((o) => (
              <div
                key={o.id}
                className={`preview-overlay text-style-${o.style} text-tx-${o.animationIn} overlay-pos-${o.position}`}
                style={{ color: o.color || theme.palette.text }}
              >
                {o.animation || o.keyframes?.length ? (
                  <AnimatedLayer
                    animation={o.animation}
                    keyframes={o.keyframes}
                    durationSec={Math.max(0.01, o.end - o.at)}
                    localSec={Math.max(0, trackElapsed - o.at)}
                    playing={playing}
                    resetKey={o.id}
                  >
                    {o.value}
                  </AnimatedLayer>
                ) : (
                  o.value
                )}
              </div>
            ))}
            {watermark && (
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

          <div className="preview-meta-strip" aria-label="Preview details">
            <span className="preview-meta-title">{title.trim() || (projectMode === "invitation" ? "You're invited!" : "Untitled voyage")}</span>
            <span className="preview-meta-bits muted">
              {activeTransition} · {theme.motion} · {textStyleLabel(textStyle)}
              {active ? ` · ${activeIndex + 1}/${clips.length}` : ""}
              {durationTargetSec ? ` · target ${durationTargetSec}s` : ""}
              {captionText.trim() ? ` · ${captionText.trim()}` : ""}
            </span>
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

          {appliedChip && (
            <div className="vj-applied-chip" role="status">
              <span>Applied: {appliedChip.label}</span>
              {appliedChip.snap && (
                <button
                  type="button"
                  onClick={() => {
                    if (appliedChip.snap) history.restore(appliedChip.snap);
                    setAppliedChip(null);
                  }}
                >
                  Undo
                </button>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => setAppliedChip(null)}>
                ×
              </button>
            </div>
          )}

          <Timeline
            clips={clips}
            starts={layout.starts}
            texts={textOverlays}
            audio={resolvedAudio.map((a) => ({ ...a, label: a.label ?? audioLabelFor(a.ref) }))}
            onAudioChange={(id, patch) => patchAudio(id, patch)}
            onAddAudio={addAudioAtPlayhead}
            totalDuration={totalDuration}
            playhead={playhead}
            playing={playing}
            accent={theme.palette.accent}
            compact={minimalist}
            selection={selection}
            gapInfo={(i) => {
              const k = gapTransitionKind(i);
              return {
                icon: transitionIcon(k),
                label: transitionLabel(k),
                custom: Boolean(clips[i]?.transitionOut || clips[i]?.transitionSpec),
                sec: layout.tx[i] ?? 0,
              };
            }}
            onSelect={(sel) => {
              setSelection(sel);
              if (sel) setInspectorOpen(true);
            }}
            onSeek={seekTo}
            onTogglePlay={() => clips.length && setPlaying((p) => !p)}
            onReorder={reorderClip}
            onTrimClip={onTrimClip}
            onTextTiming={(id, at, end) => patchText(id, { at, end })}
            onSplit={splitAtPlayhead}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
            onAddKeyframe={addKeyframeAtPlayhead}
            onUndo={doUndo}
            onRedo={doRedo}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onAddClips={() => fileInputRef.current?.click()}
            onAddText={addTextAtPlayhead}
          />

          <section
            className={`vj-inspector${minimalist ? " is-compact" : ""}${inspectorOpen ? "" : " is-collapsed"}`}
            aria-label="Inspector"
          >
            <button
              type="button"
              className="vj-insp-head"
              onClick={() => setInspectorOpen((o) => !o)}
              aria-expanded={inspectorOpen}
            >
              <span className="vj-insp-icon" aria-hidden>
                {selClip ? (selClip.kind === "video" ? "🎬" : "🖼") : selText ? "T" : selGap >= 0 ? "✦" : selection?.type === "audio" ? "♪" : "🎨"}
              </span>
              <span className="vj-insp-title">
                {selClip
                  ? `Clip ${selectedClipIndex + 1}`
                  : selText
                    ? "Text layer"
                    : selGap >= 0
                      ? `Transition ${selGap + 1} → ${selGap + 2}`
                      : selection?.type === "audio"
                        ? selAudio ? "Audio clip" : "Audio"
                        : "Project look"}
              </span>
              <span className="vj-insp-sub muted">
                {selClip
                  ? "duration · trim · animation · keyframes"
                  : selText
                    ? "text · timing · animation"
                    : selGap >= 0
                      ? "pick · duration · easing"
                      : selection?.type === "audio"
                        ? "sound · volume · fades · ducking"
                        : "grade · default motion · transitions"}
              </span>
              <span aria-hidden className="vj-insp-caret">{inspectorOpen ? "▾" : "▸"}</span>
            </button>

            {inspectorOpen && (
              <div className="vj-insp-body">
                {selClip && (
                  <>
                    <InspectorSection title="Timing" hint="seconds" compact={minimalist}>
                      <div className="vj-insp-kf-grid">
                        <label className="vj-insp-row">
                          <span>Duration</span>
                          <input
                            type="number"
                            min={0.3}
                            max={60}
                            step={0.1}
                            value={selClip.durationSec}
                            onChange={(e) =>
                              onTrimClip(
                                selClip.id,
                                { durationSec: Number(e.target.value) || selClip.durationSec },
                                { durationSec: selClip.durationSec, inSec: selClip.inSec ?? 0 },
                              )
                            }
                          />
                        </label>
                        {selClip.kind === "video" && (
                          <label className="vj-insp-row">
                            <span>Trim in</span>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={selClip.inSec ?? 0}
                              onChange={(e) =>
                                onTrimClip(
                                  selClip.id,
                                  { durationSec: selClip.durationSec, inSec: Math.max(0, Number(e.target.value) || 0) },
                                  { durationSec: selClip.durationSec, inSec: selClip.inSec ?? 0 },
                                )
                              }
                            />
                          </label>
                        )}
                      </div>
                      <div className="vj-insp-chips">
                        <button type="button" className="vj-chip" disabled={selectedClipIndex <= 0} onClick={() => reorderClip(selectedClipIndex, selectedClipIndex - 1)}>
                          ◀ Earlier
                        </button>
                        <button type="button" className="vj-chip" disabled={selectedClipIndex >= clips.length - 1} onClick={() => reorderClip(selectedClipIndex, selectedClipIndex + 1)}>
                          Later ▶
                        </button>
                        {selClip.kind === "video" && (
                          <button type="button" className={`vj-chip${selClip.mute ? "" : " active"}`} onClick={() => patchClip(selClip.id, { mute: !selClip.mute })}>
                            {selClip.mute ? "🔇 Muted" : "🔊 Sound"}
                          </button>
                        )}
                      </div>
                    </InspectorSection>
                    {selClip.kind === "video" ? (
                      <InspectorSection title={`Speed · ${clampSpeed(selClip.speed)}×`} hint="slow-mo ↔ fast" compact={minimalist}>
                        <div className="vj-insp-chips">
                          {SPEED_PRESETS.map((sp) => (
                            <button
                              key={sp}
                              type="button"
                              className={`vj-chip${clampSpeed(selClip.speed) === sp ? " active" : ""}`}
                              onClick={() => {
                                const old = clampSpeed(selClip.speed);
                                // keep the same source range → timeline length scales
                                const src = selClip.durationSec * old;
                                const bound = selClip.sourceSec ? (selClip.sourceSec - (selClip.inSec ?? 0)) : src;
                                const dur = Math.max(0.3, Math.min(src, bound) / sp);
                                patchClip(selClip.id, { speed: sp === 1 ? undefined : sp, durationSec: Math.round(dur * 100) / 100 });
                              }}
                            >
                              {sp < 1 ? "🐢" : sp > 1 ? "⚡" : "•"} {sp}×
                            </button>
                          ))}
                        </div>
                      </InspectorSection>
                    ) : (
                      <InspectorSection title="Motion direction" hint="play the photo's motion backwards" compact={minimalist}>
                        <div className="vj-insp-chips">
                          <button type="button" className={`vj-chip${selClip.reverse ? "" : " active"}`} onClick={() => patchClip(selClip.id, { reverse: undefined })}>
                            ▶ Forward
                          </button>
                          <button type="button" className={`vj-chip${selClip.reverse ? " active" : ""}`} onClick={() => patchClip(selClip.id, { reverse: true })}>
                            ⟲ Reverse
                          </button>
                        </div>
                      </InspectorSection>
                    )}
                    <AnimationPicker
                      value={selClip.animation ?? animFor(selClip)}
                      onChange={(a) => patchClip(selClip.id, { animation: a })}
                      compact={minimalist}
                    />
                    {selClip.animation && (
                      <button type="button" className="btn btn-ghost vj-insp-wide" onClick={() => patchClip(selClip.id, { animation: undefined })}>
                        ↺ Use theme motion
                      </button>
                    )}
                    <KeyframeEditor
                      keys={selClip.keyframes}
                      localSec={clipLocal(selectedClipIndex)}
                      onSet={(props) =>
                        patchClip(selClip.id, {
                          keyframes: upsertKeyframe(selClip.keyframes, clipLocal(selectedClipIndex), props),
                        })
                      }
                      onDelete={(t) => patchClip(selClip.id, { keyframes: (selClip.keyframes ?? []).filter((k) => k.t !== t) })}
                      onSeekLocal={(t) => seekTo((starts[selectedClipIndex] ?? 0) + t)}
                      compact={minimalist}
                    />
                  </>
                )}

                {selGap >= 0 && (
                  <TransitionBrowser
                    kinds={TRANSITIONS}
                    current={clips[selGap]?.transitionOut ?? null}
                    themeDefault={globalTransition}
                    spec={{
                      durationSec: transitionSecInto(clips, selGap + 1, projectTxSpec, theme),
                      easing: clips[selGap]?.transitionSpec?.easing ?? projectTxSpec?.easing,
                    }}
                    onPick={(k) => {
                      setGapTransition(selGap, k);
                      seekTo(Math.max(0, (starts[selGap + 1] ?? 0) - 0.4));
                      setPlaying(true);
                    }}
                    onSpec={(sp) => setGapSpec(selGap, { ...clips[selGap]?.transitionSpec, ...sp })}
                    onRandom={() => randomGap(selGap)}
                    onApplyAll={() => applyGapToAll(selGap)}
                    compact={minimalist}
                  />
                )}

                {selText && (
                  <>
                    <InspectorSection title="Text" compact={minimalist}>
                      <textarea
                        className="vj-insp-textarea"
                        value={selText.value}
                        rows={2}
                        onChange={(e) => patchText(selText.id, { value: e.target.value })}
                      />
                      <div className="vj-insp-kf-grid">
                        <label className="vj-insp-row">
                          <span>Start</span>
                          <input type="number" min={0} step={0.1} value={selText.at} onChange={(e) => patchText(selText.id, { at: Math.max(0, Math.min(selText.end - 0.2, Number(e.target.value) || 0)) })} />
                        </label>
                        <label className="vj-insp-row">
                          <span>End</span>
                          <input type="number" min={0} step={0.1} value={selText.end} onChange={(e) => patchText(selText.id, { end: Math.max(selText.at + 0.2, Number(e.target.value) || 0) })} />
                        </label>
                        <label className="vj-insp-row">
                          <span>Color</span>
                          <input type="color" value={selText.color || "#ffffff"} onChange={(e) => patchText(selText.id, { color: e.target.value })} />
                        </label>
                        <label className="vj-insp-row">
                          <span>Place</span>
                          <select value={selText.position} onChange={(e) => patchText(selText.id, { position: e.target.value as TextPosition })}>
                            {TEXT_POSITIONS.map((pos) => (
                              <option key={pos} value={pos}>{pos}</option>
                            ))}
                          </select>
                        </label>
                        <label className="vj-insp-row">
                          <span>Font</span>
                          <select value={selText.style} onChange={(e) => patchText(selText.id, { style: e.target.value as TextStyle })}>
                            {TEXT_STYLE_KINDS.map((st) => (
                              <option key={st} value={st}>{textStyleLabel(st)}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </InspectorSection>
                    <AnimationPicker
                      value={selText.animation}
                      onChange={(a) => patchText(selText.id, { animation: a })}
                      compact={minimalist}
                    />
                    <KeyframeEditor
                      keys={selText.keyframes}
                      localSec={textLocal(selText)}
                      onSet={(props) => patchText(selText.id, { keyframes: upsertKeyframe(selText.keyframes, textLocal(selText), props) })}
                      onDelete={(t) => patchText(selText.id, { keyframes: (selText.keyframes ?? []).filter((k) => k.t !== t) })}
                      onSeekLocal={(t) => seekTo(selText.at + t)}
                      compact={minimalist}
                    />
                  </>
                )}

                {selection?.type === "audio" && (
                  <>
                    {selAudio && (
                      <InspectorSection title={`♪ ${selAudio.label ?? audioLabelFor(selAudio.ref)}`} hint={`${selAudio.at.toFixed(1)}s → ${(selAudio.at + selAudio.durationSec).toFixed(1)}s`} compact={minimalist}>
                        <label className="vj-insp-row">
                          <span>Sound</span>
                          <select
                            value={selAudio.ref}
                            onChange={(e) => patchAudio(selAudio.id, { ref: e.target.value, label: audioLabelFor(e.target.value), inSec: 0 })}
                          >
                            {beats.map((b) => (
                              <option key={b.id} value={b.packRef}>{b.name}</option>
                            ))}
                            {customSounds.map((cs) => (
                              <option key={cs.id} value={`custom:${cs.id}`}>{cs.name}</option>
                            ))}
                          </select>
                        </label>
                        <div className="vj-insp-kf-grid">
                          <label className="vj-insp-row">
                            <span>Volume</span>
                            <input type="range" min={0} max={1.5} step={0.05} value={selAudio.volume ?? 1} onChange={(e) => patchAudio(selAudio.id, { volume: Number(e.target.value) })} />
                            <span className="vj-insp-val">{Math.round((selAudio.volume ?? 1) * 100)}%</span>
                          </label>
                          <label className="vj-insp-row">
                            <span>Fade in</span>
                            <input type="range" min={0} max={Math.min(5, selAudio.durationSec / 2)} step={0.1} value={selAudio.fadeInSec ?? 0} onChange={(e) => patchAudio(selAudio.id, { fadeInSec: Number(e.target.value) })} />
                            <span className="vj-insp-val">{(selAudio.fadeInSec ?? 0).toFixed(1)}s</span>
                          </label>
                          <label className="vj-insp-row">
                            <span>Fade out</span>
                            <input type="range" min={0} max={Math.min(5, selAudio.durationSec / 2)} step={0.1} value={selAudio.fadeOutSec ?? 0} onChange={(e) => patchAudio(selAudio.id, { fadeOutSec: Number(e.target.value) })} />
                            <span className="vj-insp-val">{(selAudio.fadeOutSec ?? 0).toFixed(1)}s</span>
                          </label>
                          <label className="vj-insp-row">
                            <span>Length</span>
                            <input type="number" min={0.3} step={0.1} value={selAudio.durationSec} onChange={(e) => patchAudio(selAudio.id, { durationSec: Math.max(0.3, Number(e.target.value) || selAudio.durationSec) })} />
                          </label>
                        </div>
                        <div className="vj-insp-chips">
                          <button type="button" className={`vj-chip${selAudio.loop !== false ? " active" : ""}`} onClick={() => patchAudio(selAudio.id, { loop: selAudio.loop === false ? true : false })}>
                            🔁 Loop {selAudio.loop !== false ? "on" : "off"}
                          </button>
                        </div>
                      </InspectorSection>
                    )}
                    <InspectorSection title="Mix" hint={`${selectedBeat.bpm} BPM`} compact={minimalist}>
                      <div className="vj-insp-chips">
                        <button
                          type="button"
                          className={`vj-chip${autoDuckOn ? " active" : ""}`}
                          onClick={() => setAutoDuck(!autoDuckOn)}
                          title="Lower music while unmuted video clips play"
                        >
                          🦆 Auto-duck {autoDuckOn ? "on" : "off"}
                        </button>
                        {BEAT_SYNC_MODES.map((m) => (
                          <button key={m} type="button" className={`vj-chip${beatSync === m ? " active" : ""}`} onClick={() => setBeatSyncMode(m)}>
                            Sync {m}
                          </button>
                        ))}
                      </div>
                      {!minimalist && (
                        <p className="vj-insp-hint">Auto-duck dips music under videos set to 🔊 Sound. Drag ◗ dots on an audio clip to shape fades.</p>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost vj-insp-wide"
                        onClick={() => {
                          if (minimalist) setMiniSheet("audio");
                          else audioPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        Music library…
                      </button>
                    </InspectorSection>
                  </>
                )}

                {!selClip && !selText && selGap < 0 && selection?.type !== "audio" && (
                  <>
                    <GradePicker
                      value={grade}
                      themeGrade={layer.grade}
                      onChange={setGrade}
                      sampleUrl={clips.find((c) => c.kind === "image")?.objectUrl}
                      compact={minimalist}
                    />
                    <InspectorSection title="Default clip motion" hint="clips without their own animation" compact={minimalist}>
                      <AnimationPicker value={effectiveAnim} onChange={setDefaultAnimation} compact={minimalist} />
                    </InspectorSection>
                    <InspectorSection title="All transitions" hint="duration · easing default" compact={minimalist}>
                      <label className="vj-insp-row">
                        <input
                          type="range"
                          min={0.2}
                          max={2}
                          step={0.1}
                          value={projectTxSpec?.durationSec ?? Math.max(0.2, theme.transitionDurationMs / 1000)}
                          onChange={(e) => setProjectTxSpec({ ...projectTxSpec, durationSec: Number(e.target.value) })}
                        />
                        <span className="vj-insp-val">
                          {(projectTxSpec?.durationSec ?? theme.transitionDurationMs / 1000).toFixed(1)}s
                        </span>
                      </label>
                    </InspectorSection>
                    <p className="vj-insp-hint">Tap a clip, ✦ gap, text or ♪ on the timeline to edit it.</p>
                  </>
                )}
              </div>
            )}
          </section>

          <p className="muted" style={{ fontSize: "0.8rem", textAlign: "center" }}>
            Draft saves to localStorage (+ media in IndexedDB). Export records browser
            WebM with beat mux when supported. Use Export… for YouTube / TikTok / IG
            presets. Cloud encode still TODO — Export JSON for the CLI.
          </p>
          <div style={{ textAlign: "center", marginTop: 8, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              onClick={() =>
                void resetProject({
                  mode: projectMode,
                  statusMsg: "Started fresh",
                })
              }
            >
              Start fresh
            </button>
            <button type="button" className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => void resetProject()}>
              Clear draft
            </button>
          </div>
        </div>

        <aside
          className={`panel compose-side-panel${
            minimalist
              ? miniSheet
                ? ` mini-sheet-open mini-sheet-${miniSheet}`
                : " mini-sheet-collapsed"
              : ""
          }`}
        >
          {minimalist && miniSheet && (
            <div className="mini-sheet-bar">
              <span className="muted" style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                {miniSheet === "theme"
                  ? "Theme & templates"
                  : miniSheet === "audio"
                    ? "Audio"
                    : "Text & captions"}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                onClick={() => setMiniSheet(null)}
                aria-label="Close panel"
                title="Close"
              >
                ✕
              </button>
            </div>
          )}
          <div className="side-section side-section-theme">
          <h3>Theme panel</h3>
          <p className="muted side-blurb" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            Tap a theme or template to apply and close — tweak details anytime.
          </p>
          <div
            className="themes-applied-hint"
            style={{
              marginBottom: 10,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border-subtle)",
              background: "rgba(61, 220, 151, 0.08)",
            }}
          >
            Now · {theme.name}
            {templateId
              ? ` · ${getTemplateById(templateId)?.name ?? "template"}`
              : ""}
          </div>
          {projectMode === "invitation" && (
            <div className="invite-details-panel" style={{ marginTop: 0, marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 8, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Invitation details
              </div>
              <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 10px" }}>
                Shown on guest play &amp; export cards — tweak after applying a pack.
              </p>
              <div className="invite-details-grid">
                <label>
                  <span className="muted" style={{ fontSize: "0.72rem" }}>Host (who's inviting)</span>
                  <input
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder={
                      (templateId && getTemplateById(templateId)?.hostPlaceholder) ||
                      "Your name"
                    }
                    aria-label="Host name"
                  />
                </label>
                <label>
                  <span className="muted" style={{ fontSize: "0.72rem" }}>Guest / to</span>
                  <input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Optional"
                    aria-label="Guest name"
                  />
                </label>
                <label>
                  <span className="muted" style={{ fontSize: "0.72rem" }}>Event type</span>
                  <input
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    placeholder="Birthday, Wedding…"
                    aria-label="Event type"
                  />
                </label>
                <label>
                  <span className="muted" style={{ fontSize: "0.72rem" }}>Event name</span>
                  <input
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="Maya's Birthday"
                    aria-label="Event name"
                  />
                </label>
                <label>
                  <span className="muted" style={{ fontSize: "0.72rem" }}>When</span>
                  <input
                    value={eventWhen}
                    onChange={(e) => setEventWhen(e.target.value)}
                    placeholder="Sat · 4pm"
                    aria-label="Event when"
                  />
                </label>
                <label>
                  <span className="muted" style={{ fontSize: "0.72rem" }}>Where</span>
                  <input
                    value={eventWhere}
                    onChange={(e) => setEventWhere(e.target.value)}
                    placeholder="Optional place"
                    aria-label="Event where"
                  />
                </label>
              </div>
            </div>
          )}
          <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 6, fontWeight: 700 }}>
            Themes — tap to apply
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  const snapBefore = historyRef.current?.checkpoint() ?? null;
                  setThemeId(t.id);
                  {
                    const sb = t.suggestedBeatIds?.[0];
                    const b = sb ? getBeatById(sb) : undefined;
                    if (b) setAudioTrackRef(b.packRef);
                  }
                  setAppliedChip({ label: t.name, snap: snapBefore });
                  setTransitionOverride(null);
        setGrade(undefined);
        setDefaultAnimation(undefined);
        setProjectTxSpec(undefined);
                  setMiniSheet(null);
                  setStatus(`Theme · ${t.name}`);
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


          <div className="muted" style={{ fontSize: "0.8rem", marginTop: 14, marginBottom: 6, fontWeight: 700 }}>
            {projectMode === "invitation" ? "Invitation templates — tap to apply" : "Voyage templates — tap to apply"}
          </div>
          {projectMode === "invitation" ? (
            <div className="invite-tpl-gallery">
              {templates.map((tpl) => {
                const selected = templateId === tpl.id;
                const emoji =
                  tpl.eventEmoji ||
                  (tpl.defaultOverlays?.find((o) =>
                    /\p{Extended_Pictographic}/u.test(o.value),
                  )?.value.split(/\s+/)[0]) ||
                  "✉️";
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    className={`invite-tpl-card${selected ? " is-selected" : ""}${
                      selected && ai.kind === "template" ? " is-pulsing" : ""
                    }`}
                    style={
                      selected
                        ? {
                            ["--accent-brand" as string]:
                              tpl.theme?.palette.accent ?? "var(--accent-brand)",
                          }
                        : undefined
                    }
                    onClick={() => applyTemplate(tpl)}
                    title={tpl.description}
                  >
                    <div className="invite-tpl-card-top">
                      <span className="invite-tpl-emoji" aria-hidden>
                        {emoji}
                      </span>
                      <span className="invite-tpl-name">{tpl.name}</span>
                      <span className="muted" style={{ marginLeft: "auto", fontSize: "0.68rem" }}>
                        {tpl.aspect ?? "9:16"}
                      </span>
                    </div>
                    <div className="invite-tpl-vibe">
                      {tpl.vibe || tpl.description || tpl.eventType || "Invitation pack"}
                    </div>
                    <div className="invite-tpl-audio">
                      ♪ {tpl.beat?.name ?? tpl.beatId}
                    </div>
                    <div className="invite-tpl-includes">
                      Includes: {transitionIcon(tpl.transition)}{" "}
                      {transitionLabel(tpl.transition)} · {tpl.textStyle.replace(/-/g, " ")} ·{" "}
                      {tpl.motion}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflow: "auto" }}>
              {templates.slice(0, 14).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={`chip${templateId === tpl.id && ai.kind === "template" ? " is-pulsing" : ""}`}
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
          )}
          <Link
            to={
              projectMode === "invitation"
                ? "/themes?tab=templates&filter=invitation"
                : "/themes?tab=templates"
            }
            className="muted"
            style={{ fontSize: "0.75rem", display: "inline-block", marginTop: 6 }}
          >
            {projectMode === "invitation"
              ? "Browse invitation templates →"
              : "Browse all templates →"}
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
              <button
                type="button"
                className="chip"
                title="Pick a random transition (excludes cut)"
                onClick={pickRandomTransition}
              >
                <span className="chip-tx-icon" aria-hidden>🎲</span>
                Random
              </button>
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
                    onClick={() => pickGlobalTransition(kind)}
                  >
                    <span className="chip-tx-icon" aria-hidden>
                      {transitionIcon(kind)}
                    </span>
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

          </div>

          <section className="side-section side-section-text" aria-label="Text & captions">
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

          <section ref={audioPanelRef} className="audio-panel side-section side-section-audio" aria-label="Audio">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <h3 style={{ marginBottom: 4, marginTop: 0 }}>Audio panel</h3>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                title="Add soundtrack from device or library"
                aria-label="Add soundtrack"
                onClick={() => {
                  setMediaImporterMode("audio");
                  setMediaImporterOpen(true);
                }}
              >
                ＋ Sound
              </button>
            </div>
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

      <MediaImporter
        open={mediaImporterOpen}
        onClose={() => setMediaImporterOpen(false)}
        mode={mediaImporterMode}
        onImportFiles={(files) => void importAnyFiles(files)}
        onInsertLibrary={(item) => void insertLibraryItem(item)}
        onImportAudioUrl={
          mediaImporterMode === "clips"
            ? undefined
            : (url) => {
                setSoundUrlInput(url);
                // defer to existing URL importer after state flush
                window.setTimeout(() => {
                  const parsed = (() => {
                    try {
                      return new URL(url);
                    } catch {
                      return null;
                    }
                  })();
                  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
                    setStatus("Invalid audio URL");
                    return;
                  }
                  const id = newSoundId();
                  const name =
                    decodeURIComponent(parsed.pathname.split("/").pop() || "Remote sound")
                      .replace(/\.[^.]+$/, "") || "Remote sound";
                  const sound = {
                    id,
                    name,
                    source: "url" as const,
                    url,
                    mimeType: "audio/mpeg",
                  };
                  setCustomSounds((prev) => [...prev, sound]);
                  setCustomSoundUrls((prev) => ({ ...prev, [id]: url }));
                  setAudioTrackRef(`custom:${id}`);
                  setStatus(`Added remote sound · ${name}`);
                }, 0);
              }
        }
      />
    </div>
  );
}
