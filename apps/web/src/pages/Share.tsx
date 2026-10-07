import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { brand } from "@voyajes/core";
import { CommentThread } from "../components/CommentThread";
import { EmojiPicker, QuickReactionBar } from "../components/EmojiPicker";
import { InvitePlayer } from "../components/InvitePlayer";
import { Logo } from "../components/Logo";
import { getBeatByRef } from "../data/beats";
import { getThemeById } from "../data/themes";
import { exportFilename, getExportPreset } from "../data/exportPresets";
import { assetUrl } from "../lib/assetUrl";
import {
  getShareReactions,
  toggleShareReaction,
  type ShareReactionMap,
} from "../lib/commentStore";
import { getBlob, loadDraft, saveDraft, type DraftState } from "../lib/draftStore";
import { rememberEmoji } from "../lib/emoji";
import {
  downloadBlob,
  exportSlideshowWebm,
  type ExportProgress,
} from "../lib/exportWebm";
import { getLastExport, setLastExport } from "../lib/lastExportStore";
import {
  ensureShareFromDraft,
  formatDuration,
  getShare,
  publicShareUrl,
  updateShare,
  type ShareRecord,
} from "../lib/shareStore";
import {
  applyPortableUrlsToRecord,
  buildPortableShareUrl,
  cachePortablePack,
  decodePortablePayload,
  downloadInvitePackJson,
  hasPortableHashIntent,
  hydratePortablePack,
  loadInvitePackFromFile,
  parsePortableHash,
  PORTABLE_CHAT_WARN_CHARS,
  readCachedPortablePack,
  revokeHydratedUrls,
  type BuildPortableResult,
  type PortablePackV1,
} from "../lib/portableShare";
import {
  blobToShareFile,
  buildWhatsAppInviteText,
  shareInviteToWhatsApp,
} from "../lib/whatsappShare";
import { markStartFresh } from "../lib/startFresh";

function myReactKey(id: string) {
  return `voyajes.share.myreact.${id}`;
}

function loadMyShareReacts(id: string): string[] {
  try {
    const raw = sessionStorage.getItem(myReactKey(id));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function saveMyShareReacts(id: string, emojis: string[]) {
  try {
    sessionStorage.setItem(myReactKey(id), JSON.stringify(emojis));
  } catch {
    /* ignore */
  }
}

function unlockKey(id: string) {
  return `voyajes.share.unlock.${id}`;
}


function GuestEngageDrawer({
  shareId,
  shareReactions,
  myReacts,
  onReact,
}: {
  shareId: string;
  shareReactions: ShareReactionMap;
  myReacts: string[];
  onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = Object.values(shareReactions).reduce((s, n) => s + n, 0);

  return (
    <div className={`invite-engage${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="invite-engage-chip"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close" : `React & comments${count ? ` · ${count}` : ""}`}
      </button>
      {open && (
        <div className="invite-engage-sheet">
          <section aria-label="Reactions">
            <div className="share-react-head">
              <h3 style={{ margin: "0 0 4px", fontSize: "0.95rem" }}>React</h3>
              <EmojiPicker onSelect={onReact} label="😀＋" />
            </div>
            <QuickReactionBar onSelect={onReact} active={myReacts} />
            <div className="share-react-counts" style={{ marginTop: 8 }}>
              {Object.entries(shareReactions)
                .sort((a, b) => b[1] - a[1])
                .map(([emoji, n]) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`comment-react-chip${
                      myReacts.includes(emoji) ? " is-mine" : ""
                    }`}
                    onClick={() => onReact(emoji)}
                  >
                    {emoji} <span>{n}</span>
                  </button>
                ))}
            </div>
          </section>
          <CommentThread shareId={shareId} />
        </div>
      )}
    </div>
  );
}

export function Share() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hostView = searchParams.get("host") === "1";
  const [guestPlaying, setGuestPlaying] = useState(false);
  const [record, setRecord] = useState<ShareRecord | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [passwordOn, setPasswordOn] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [shareReactions, setShareReactions] = useState<ShareReactionMap>({});
  const [myReacts, setMyReacts] = useState<string[]>([]);
  const [titleEdit, setTitleEdit] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [portableUrl, setPortableUrl] = useState<string | null>(null);
  const [portableBusy, setPortableBusy] = useState(false);
  const [portablePack, setPortablePack] = useState<PortablePackV1 | null>(null);
  const [fromPortableHash, setFromPortableHash] = useState(false);
  const [portableHashError, setPortableHashError] = useState(false);
  const [portableFlags, setPortableFlags] = useState<BuildPortableResult | null>(null);
  const portableObjectUrlsRef = useRef<Record<string, string>>({});
  const packFileInputRef = useRef<HTMLInputElement>(null);

  const applyHydratedPack = useCallback((pack: PortablePackV1, keepHashUrl?: string) => {
    revokeHydratedUrls(portableObjectUrlsRef.current);
    const hydrated = hydratePortablePack(pack);
    portableObjectUrlsRef.current = hydrated.objectUrls;
    const withUrls = applyPortableUrlsToRecord(
      hydrated.record,
      hydrated.objectUrls,
    );
    setFromPortableHash(true);
    setPortableHashError(false);
    setPortablePack(pack);
    setRecord(withUrls);
    setPosterUrl(hydrated.posterUrl);
    setPasswordOn(withUrls.passwordProtected);
    setTitleEdit(withUrls.title);
    setShareReactions(getShareReactions(withUrls.id));
    setMyReacts(loadMyShareReacts(withUrls.id));
    try {
      setUnlocked(
        !withUrls.passwordProtected ||
          sessionStorage.getItem(unlockKey(withUrls.id)) === "1",
      );
    } catch {
      setUnlocked(!withUrls.passwordProtected);
    }
    if (keepHashUrl) {
      setPortableUrl(keepHashUrl);
    } else {
      setPortableUrl(null);
    }
    setReady(true);
  }, []);

  const openInvitePackFile = useCallback(
    async (file: File) => {
      try {
        setStatus("Opening invite pack…");
        const pack = await loadInvitePackFromFile(file);
        applyHydratedPack(pack);
        setStatus("Invite pack loaded");
      } catch (err) {
        console.warn("invite pack open failed", err);
        setStatus(
          "Could not open that file — use a .voyajes.json invite pack from the host.",
        );
        setPortableHashError(true);
        setRecord(null);
        setReady(true);
      }
    },
    [applyHydratedPack],
  );

  // Resolve share: portable hash → localStorage → draft bootstrap (host only)
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      setPortableHashError(false);

      // 1) Portable pack in URL hash (works in incognito / other devices)
      // Never rewrite / fall through when the URL has portable-hash intent —
      // a truncated WhatsApp link must NOT bootstrap an unrelated local draft.
      const hashIntent = hasPortableHashIntent(window.location.hash);
      const payload = parsePortableHash(window.location.hash);
      if (hashIntent) {
        if (!payload) {
          if (cancelled) return;
          setPortableHashError(true);
          setFromPortableHash(false);
          setRecord(null);
          setReady(true);
          return;
        }
        try {
          let pack = readCachedPortablePack(payload);
          if (!pack) {
            pack = await decodePortablePayload(payload);
            cachePortablePack(payload, pack);
          }
          if (cancelled) return;
          const hashUrl =
            window.location.href.split("#")[0] + window.location.hash;
          applyHydratedPack(pack, hashUrl);
          return;
        } catch (err) {
          console.warn("portable pack decode failed", err);
          if (cancelled) return;
          // Do NOT loadDraft / ensureShareFromDraft / navigate — keep URL intact
          setPortableHashError(true);
          setFromPortableHash(false);
          setRecord(null);
          setReady(true);
          return;
        }
      }

      let share = routeId && routeId !== "p" ? getShare(routeId) : null;
      const draft = loadDraft();

      // Host-only: bootstrap from local draft when opening /share or /v/:id
      // with no portable hash and local ownership / draft present.
      if (!share && draft) {
        const theme = getThemeById(draft.themeId);
        const beat = getBeatByRef(draft.audioTrackRef);
        share = ensureShareFromDraft(draft, {
          themeName: theme?.name ?? "Theme",
          themeAccent: theme?.palette.accent ?? "#7C5CFF",
          themeGradient: theme?.gradient ?? "var(--grad-brand)",
          audioName: beat?.name ?? "Beat",
          audioBpm: beat?.bpm ?? 0,
        });
        if (!draft.shareId || draft.shareId !== share.id) {
          const next: DraftState = { ...draft, shareId: share.id };
          saveDraft(next);
        }
        if (routeId !== share.id) {
          // Preserve any hash if somehow present (should be none here)
          const hash = window.location.hash || "";
          navigate(`/v/${share.id}${hash}`, { replace: true });
          return;
        }
      }

      if (cancelled) return;

      if (!share) {
        setRecord(null);
        setFromPortableHash(false);
        setReady(true);
        return;
      }

      setFromPortableHash(false);
      setRecord(share);
      setPasswordOn(share.passwordProtected);
      setTitleEdit(share.title);
      setShareReactions(getShareReactions(share.id));
      setMyReacts(loadMyShareReacts(share.id));
      try {
        setUnlocked(
          !share.passwordProtected ||
            sessionStorage.getItem(unlockKey(share.id)) === "1",
        );
      } catch {
        setUnlocked(!share.passwordProtected);
      }

      if (share.posterClipId) {
        const blob = await getBlob(share.posterClipId);
        if (cancelled) return;
        if (blob && blob.type.startsWith("image/")) {
          objectUrl = URL.createObjectURL(blob);
          setPosterUrl(objectUrl);
        } else if (blob && blob.type.startsWith("video/")) {
          objectUrl = URL.createObjectURL(blob);
          setPosterUrl(objectUrl);
        } else {
          setPosterUrl(null);
        }
      } else {
        setPosterUrl(null);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      revokeHydratedUrls(portableObjectUrlsRef.current);
      portableObjectUrlsRef.current = {};
    };
  }, [routeId, navigate, applyHydratedPack]);

  // Host: build portable URL so Copy / WhatsApp embed media
  useEffect(() => {
    if (!record || fromPortableHash) return;
    // Only build when this browser has the share locally (host)
    if (!getShare(record.id)) return;

    let cancelled = false;
    setPortableBusy(true);
    setStatus("Preparing shareable link…");
    (async () => {
      try {
        const result = await buildPortableShareUrl(record, {
          onProgress: (msg) => {
            if (!cancelled) setStatus(msg);
          },
        });
        if (cancelled) return;
        setPortableUrl(result.url);
        setPortablePack(result.pack);
        setPortableFlags(result);
        setStatus(result.status);
      } catch (err) {
        if (cancelled) return;
        console.warn("portable build failed", err);
        setPortableUrl(publicShareUrl(record.id));
        setStatus(
          "Could not embed media in link — local link only. Try Export video for WhatsApp.",
        );
      } finally {
        if (!cancelled) setPortableBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [record, fromPortableHash]);

  const shareUrl = useMemo(() => {
    if (portableUrl) return portableUrl;
    if (record) return publicShareUrl(record.id);
    return `https://${brand.shareHost}/v/…`;
  }, [record, portableUrl]);

  const isVideoPoster =
    !fromPortableHash &&
    !!record?.posterMime?.startsWith("video/") &&
    !!posterUrl;

  const copy = useCallback(async () => {
    if (!record) return;
    if (portableBusy || !portableUrl) {
      setStatus("Preparing shareable link… wait until ready, then Copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(portableUrl);
      setCopied(true);
      const long =
        !!portableFlags?.chatTruncateRisk ||
        portableUrl.length > PORTABLE_CHAT_WARN_CHARS;
      setStatus(
        long
          ? "Link copied — it is long; prefer Download invite pack for WhatsApp"
          : "Shareable link copied — works in any browser",
      );
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus("Could not copy — select the full link in the box below");
    }
  }, [record, portableBusy, portableUrl, portableFlags]);

  const persistPassword = useCallback(
    (on: boolean) => {
      if (!record) return;
      setPasswordOn(on);
      const updated = updateShare(record.id, { passwordProtected: on });
      if (updated) setRecord(updated);

      const draft = loadDraft();
      if (draft && (draft.shareId === record.id || !draft.shareId)) {
        saveDraft({
          ...draft,
          shareId: record.id,
          sharePassword: on,
        });
      }

      if (!on) {
        try {
          sessionStorage.setItem(unlockKey(record.id), "1");
        } catch {
          /* ignore */
        }
        setUnlocked(true);
        setGateError(null);
      } else {
        try {
          sessionStorage.removeItem(unlockKey(record.id));
        } catch {
          /* ignore */
        }
        setUnlocked(false);
      }
      setStatus(
        on
          ? "Password gate on · local stub (any non-empty password unlocks)"
          : "Share is public",
      );
    },
    [record],
  );

  const tryUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (!record) return;
    if (passwordInput.trim().length === 0) {
      setGateError("Enter a password");
      return;
    }
    // Local stub: any non-empty password unlocks
    try {
      sessionStorage.setItem(unlockKey(record.id), "1");
    } catch {
      /* ignore */
    }
    setUnlocked(true);
    setGateError(null);
    setPasswordInput("");
  };

  const onShareReact = useCallback(
    (emoji: string) => {
      if (!record) return;
      rememberEmoji(emoji);
      const on = myReacts.includes(emoji);
      const nextMap = toggleShareReaction(record.id, emoji, on);
      setShareReactions(nextMap);
      const nextMine = on
        ? myReacts.filter((e) => e !== emoji)
        : [...myReacts, emoji];
      setMyReacts(nextMine);
      saveMyShareReacts(record.id, nextMine);
    },
    [record, myReacts],
  );

  const persistTitle = useCallback(() => {
    if (!record) return;
    const next = titleEdit.trim() || "Untitled voyage";
    if (next === record.title) return;
    const updated = updateShare(record.id, { title: next });
    if (updated) setRecord(updated);
    const draft = loadDraft();
    if (draft && (draft.shareId === record.id || !draft.shareId)) {
      saveDraft({ ...draft, shareId: record.id, title: next });
    }
    setStatus("Title updated (emoji OK)");
  }, [record, titleEdit]);

  const exportShareVideo = useCallback(async (): Promise<{
    blob: Blob;
    filename: string;
    mimeType: string;
  } | null> => {
    if (!record) return null;
    const playback = record.playback;
    const metas = playback?.clips ?? [];
    if (metas.length === 0) {
      setStatus("No clips to export — add media in Compose first.");
      return null;
    }

    const theme =
      getThemeById(playback?.themeId ?? record.themeId) ??
      getThemeById("theme.ocean-pop");
    if (!theme) {
      setStatus("Theme missing — cannot export");
      return null;
    }

    setExporting(true);
    setExportProgress({
      phase: "prepare",
      ratio: 0,
      clipIndex: 0,
      clipCount: metas.length,
      message: "Preparing export…",
    });
    setStatus("Exporting video…");

    const objectUrls: string[] = [];
    try {
      const live = [];
      for (const meta of metas) {
        const blob = await getBlob(meta.id);
        if (!blob) continue;
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        live.push({
          id: meta.id,
          kind: meta.kind,
          objectUrl,
          fileName: meta.fileName,
          durationSec: meta.durationSec,
          transitionOut: meta.transitionOut,
        });
      }
      if (live.length === 0) {
        setStatus(
          "Clips not found on this device (IndexedDB). Export from Compose on the phone that created them.",
        );
        return null;
      }

      const beat = getBeatByRef(playback?.audioTrackRef ?? record.audioTrackRef);
      const audioOpts = beat?.previewUrl
        ? {
            previewUrl: beat.previewUrl,
            beatName: beat.name,
            ducking: playback?.ducking ?? true,
          }
        : undefined;

      const preset = getExportPreset("custom");
      const result = await exportSlideshowWebm({
        clips: live,
        theme,
        title: record.title,
        aspect: playback?.aspect ?? "9:16",
        transition: playback?.transitionOverride ?? theme.transition,
        textOverlays: playback?.textOverlays,
        captionText: playback?.captionText,
        captionStyle: playback?.captionStyle,
        textStyle: playback?.textStyle,
        shortEdge: preset.shortEdge,
        watermark: playback?.watermark ?? false,
        burnTitle: false,
        mode: record.mode,
        invitation: record.invitation ?? playback?.invitation,
        audio: audioOpts,
        onProgress: (p) => {
          setExportProgress(p);
          setStatus(p.message);
        },
      });

      const name = exportFilename(record.title, preset, result.extension);
      downloadBlob(result.blob, name);
      setLastExport({
        blob: result.blob,
        filename: name,
        mimeType: result.mimeType,
        shareId: record.id,
        title: record.title,
        createdAt: Date.now(),
      });
      setStatus(
        `Downloaded ${name} (${Math.round(result.blob.size / 1024)} KB) — ready for WhatsApp`,
      );
      return { blob: result.blob, filename: name, mimeType: result.mimeType };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setStatus(msg);
      return null;
    } finally {
      for (const u of objectUrls) URL.revokeObjectURL(u);
      setExporting(false);
      setExportProgress(null);
    }
  }, [record]);

  const shareToWhatsApp = useCallback(async () => {
    if (!record) return;
    setWhatsappBusy(true);
    try {
      let exp = getLastExport(record.id) ?? getLastExport();
      if (!exp) {
        const exported = await exportShareVideo();
        if (exported) {
          exp = {
            blob: exported.blob,
            filename: exported.filename,
            mimeType: exported.mimeType,
            shareId: record.id,
            title: record.title,
            createdAt: Date.now(),
          };
        }
      }

      // Prefer portable URL (hash payload); rebuild if still preparing
      let link = portableUrl;
      if (!link && !fromPortableHash) {
        try {
          const built = await buildPortableShareUrl(record);
          link = built.url;
          setPortableUrl(built.url);
          setPortablePack(built.pack);
          setPortableFlags(built);
        } catch {
          link = publicShareUrl(record.id);
        }
      }
      if (!link) link = publicShareUrl(record.id);

      const file = exp ? blobToShareFile(exp.blob, exp.filename) : null;
      const textMsg = buildWhatsAppInviteText({
        title: record.title,
        shareUrl: link,
        isInvitation: record.mode === "invitation",
        attachHint: !file,
        portable: !!portableUrl || link.includes("#vj1."),
      });

      const result = await shareInviteToWhatsApp({
        title: record.title,
        text: textMsg,
        file,
      });

      if (result === "shared-file") {
        setStatus("Shared video via system share — pick WhatsApp");
      } else if (result === "whatsapp-text") {
        if (exp) downloadBlob(exp.blob, exp.filename);
        setStatus(
          exp
            ? "Opened WhatsApp — attach the video you just downloaded"
            : "Opened WhatsApp with text — Export video first so your friend can watch",
        );
      } else if (result === "aborted") {
        setStatus("Share cancelled");
      } else {
        setStatus("Could not open WhatsApp");
      }
    } finally {
      setWhatsappBusy(false);
    }
  }, [record, exportShareVideo, portableUrl, fromPortableHash]);

  // Open Graph–style document meta for invitation / voyage shares
  useEffect(() => {
    if (!record) return;
    const prevTitle = document.title;
    const isInvite = record.mode === "invitation";
    document.title = isInvite
      ? `${record.title} · Invitation · Voyajes`
      : `${record.title} · Voyajes`;

    const upsert = (attr: "name" | "property", key: string, content: string) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const desc = isInvite
      ? `You're invited — ${record.themeName} · ${record.audioName} · animated with Voyajes`
      : `${brand.tagline} · ${record.themeName} · ${record.audioName}`;
    upsert("name", "description", desc);
    upsert("property", "og:title", record.title);
    upsert("property", "og:description", desc);
    upsert("property", "og:type", isInvite ? "website" : "video.other");
    upsert("property", "og:url", publicShareUrl(record.id));
    upsert("property", "og:site_name", brand.name);
    upsert("name", "twitter:card", "summary_large_image");
    upsert("name", "twitter:title", record.title);
    upsert("name", "twitter:description", desc);
    const icon = assetUrl("/brand/logo-app.png");
    if (icon) {
      upsert("property", "og:image", icon.startsWith("http") ? icon : `${window.location.origin}${icon}`);
    }

    return () => {
      document.title = prevTitle;
    };
  }, [record]);

  // Immersive guest invite: tell Layout to hide app chrome
  useEffect(() => {
    const isInviteGuest =
      !!record && record.mode === "invitation" && !hostView;
    if (isInviteGuest) {
      document.body.classList.add("invite-guest");
    } else {
      document.body.classList.remove("invite-guest");
    }
    return () => {
      document.body.classList.remove("invite-guest");
    };
  }, [record, hostView]);

  if (!ready) {
    return (
      <div className="share-page">
        <p className="muted" style={{ textAlign: "center" }}>
          Loading share…
        </p>
      </div>
    );
  }

  if (!record) {
    const truncatedInvite = portableHashError;
    return (
      <div className="share-page share-empty">
        <div className="share-empty-card">
          <Logo size={36} />
          <h1 className="display" style={{ margin: "16px 0 8px" }}>
            {truncatedInvite
              ? "This invite link was cut off or damaged"
              : "This link has no invite attached"}
          </h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {truncatedInvite ? (
              <>
                Chat apps often truncate long links. Ask the host to use{" "}
                <strong>Download invite pack</strong> or{" "}
                <strong>Export video + WhatsApp</strong>.
              </>
            ) : (
              <>
                Ask the host to copy the link again from Share — new builds embed
                the invite in the link so it works in incognito and on other phones.
              </>
            )}
          </p>
          <input
            ref={packFileInputRef}
            type="file"
            accept=".json,.voyajes.json,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openInvitePackFile(f);
              e.target.value = "";
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16, justifyContent: "center" }}>
            <Link to="/" className="btn btn-primary">
              Home
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => packFileInputRef.current?.click()}
            >
              Open invite pack file
            </button>
            {!truncatedInvite && (
              <Link
                to="/create?fresh=1"
                className="btn btn-ghost"
                onClick={() => markStartFresh("voyage")}
              >
                Go to Compose
              </Link>
            )}
          </div>
          {status && (
            <p className="muted" style={{ fontSize: "0.8rem", marginTop: 12 }}>
              {status}
            </p>
          )}
        </div>
      </div>
    );
  }

  const locked = passwordOn && !unlocked;
  const isInvitation = record.mode === "invitation";
  const showGuestInvite = isInvitation && !hostView && !locked;

  if (showGuestInvite) {
    return (
      <div className="invite-immersive">
        {!guestPlaying ? (
          <div
            className="invite-poster-stage"
            style={{
              background: posterUrl
                ? undefined
                : record.themeGradient || "var(--grad-ocean)",
            }}
          >
            {posterUrl && !isVideoPoster && (
              <img src={posterUrl} alt="" className="invite-poster-media" />
            )}
            {posterUrl && isVideoPoster && (
              <video
                src={posterUrl}
                className="invite-poster-media"
                muted
                playsInline
                autoPlay
                loop
              />
            )}
            <div
              className="invite-poster-grade"
              style={{
                background: record.themeGradient,
                mixBlendMode: "soft-light",
                opacity: posterUrl ? 0.35 : 0.9,
              }}
            />
            <div className="invite-poster-vignette" aria-hidden />
            <div className="invite-poster-copy">
              {(record.invitation?.hostName || record.invitation?.eventName) && (
                <p className="invite-poster-who">
                  {record.invitation?.hostName
                    ? `${record.invitation.hostName} invites you`
                    : "You're invited"}
                  {record.invitation?.eventName
                    ? ` · ${record.invitation.eventName}`
                    : record.invitation?.eventType
                      ? ` · ${record.invitation.eventType}`
                      : ""}
                </p>
              )}
              <button
                type="button"
                className="invite-play-btn"
                aria-label="Play invitation"
                onClick={() => setGuestPlaying(true)}
              >
                <span className="invite-play-icon" aria-hidden>
                  ▶
                </span>
                Play invite
              </button>
            </div>
          </div>
        ) : (
          <div className="invite-playback-stage">
            <InvitePlayer record={record} autoPlay immersive />
          </div>
        )}

        <GuestEngageDrawer
          shareId={record.id}
          shareReactions={shareReactions}
          myReacts={myReacts}
          onReact={onShareReact}
        />

        <footer className="invite-discreet-footer">
          <Logo size={22} />
          <span className="invite-footer-mark">Voyajes</span>
          <span className="invite-footer-sep" aria-hidden>
            ·
          </span>
          <Link
            to="/create?mode=invitation&fresh=1"
            className="invite-footer-link"
            onClick={() => markStartFresh("invitation")}
          >
            Create your own
          </Link>
          <span className="invite-footer-sep" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="invite-footer-link"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
            onClick={() => void shareToWhatsApp()}
          >
            WhatsApp
          </button>
          <span className="invite-footer-sep" aria-hidden>
            ·
          </span>
          <Link to={`/v/${record.id}?host=1`} className="invite-footer-link">
            Host
          </Link>
        </footer>
      </div>
    );
  }

  return (
    <div className="share-page">
      <div className="share-layout">
        <div className="share-hero">
          <div
            className="share-bar"
            style={{ background: record.themeGradient || "var(--grad-brand)" }}
          />

          {locked ? (
            <div className="share-gate">
              <div className="share-gate-icon" aria-hidden>
                🔒
              </div>
              <h2 className="display" style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>
                Password protected
              </h2>
              <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.9rem" }}>
                This voyage needs a password to view.
              </p>
              <form onSubmit={tryUnlock} className="share-gate-form">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  aria-label="Share password"
                />
                <button type="submit" className="btn btn-primary">
                  Unlock
                </button>
              </form>
              {gateError && (
                <p style={{ color: "var(--state-danger)", fontSize: "0.85rem" }}>
                  {gateError}
                </p>
              )}
            </div>
          ) : (
            <div
              className="share-poster"
              style={{
                background: posterUrl
                  ? undefined
                  : record.themeGradient || "var(--grad-ocean)",
              }}
            >
              {posterUrl && !isVideoPoster && (
                <img src={posterUrl} alt="" className="share-poster-media" />
              )}
              {posterUrl && isVideoPoster && (
                <video
                  src={posterUrl}
                  className="share-poster-media"
                  muted
                  playsInline
                  autoPlay
                  loop
                />
              )}
              <div
                className="share-poster-grade"
                style={{
                  background: record.themeGradient,
                  mixBlendMode: "soft-light",
                  opacity: posterUrl ? 0.4 : 0.85,
                }}
              />
              <button
                type="button"
                className="share-play"
                aria-label={isInvitation ? "Play invitation" : "Play preview"}
                onClick={() => setGuestPlaying(true)}
              >
                ▶
              </button>
              <div className="share-poster-caption">
                <div className="share-poster-title">{record.title}</div>
                <div className="share-poster-meta">
                  {formatDuration(record.durationSec)} · {record.clipCount} clip
                  {record.clipCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          )}

          {guestPlaying && isInvitation && !locked && (
            <div style={{ padding: "12px 16px 0" }}>
              <InvitePlayer record={record} autoPlay />
            </div>
          )}

          <div className="share-body">
            <div className="share-header-row">
              <div>
                <h1 className="display share-title">{record.title}</h1>
                <p className="muted share-subtitle">
                  {formatDuration(record.durationSec)} ·{" "}
                  {isInvitation ? "Invitation · " : ""}Made with Voyajes
                </p>
              </div>
              <Logo size={28} />
            </div>
            {isInvitation && (
              <div className="invite-hero-label" style={{ marginBottom: 12 }}>
                <span aria-hidden>✉️</span> Invitation mode · host view
              </div>
            )}

            <div className="share-chips">
              <span
                className="chip"
                style={{
                  borderColor: `${record.themeAccent}66`,
                  background: `linear-gradient(90deg, ${record.themeAccent}22, transparent)`,
                }}
              >
                <span
                  className="swatch"
                  style={{ background: record.themeAccent }}
                />
                {record.themeName}
              </span>
              <span className="chip">
                {record.clipCount} clip{record.clipCount === 1 ? "" : "s"}
              </span>
              <span className="chip">
                ♪ {record.audioName}
                {record.audioBpm ? ` · ${record.audioBpm} BPM` : ""}
              </span>
              {passwordOn && (
                <span className="chip chip-lock" title="Password protected">
                  🔒 Protected
                </span>
              )}
            </div>

            {/* Open Graph–style card */}
            <div className="og-card" aria-label="Link preview">
              <div
                className="og-card-thumb"
                style={{
                  backgroundImage: posterUrl && !isVideoPoster
                    ? `url(${posterUrl})`
                    : record.themeGradient,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {isVideoPoster && posterUrl && (
                  <video src={posterUrl} muted playsInline />
                )}
              </div>
              <div className="og-card-body">
                <div className="og-card-host">{brand.shareHost}</div>
                <div className="og-card-title">{record.title}</div>
                <div className="og-card-desc muted">
                  {isInvitation ? "Invitation" : brand.tagline} · {record.themeName} ·{" "}
                  {record.audioName}
                </div>
              </div>
            </div>

            <div className="share-link-box-wrap">
              <input
                className="share-link-box"
                type="text"
                readOnly
                value={
                  portableBusy
                    ? "Preparing shareable link…"
                    : portableUrl || shareUrl
                }
                aria-label="Full invite link"
                onFocus={(e) => e.currentTarget.select()}
              />
              {!portableBusy && portableFlags?.chatTruncateRisk && (
                <p className="muted share-link-warn" style={{ fontSize: "0.78rem", margin: "8px 0 0" }}>
                  Link is long — prefer <strong>Download invite pack</strong> for WhatsApp
                  (chat apps often truncate long links).
                </p>
              )}
            </div>

            <div className="share-actions">
              {isInvitation && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={exporting || whatsappBusy || portableBusy}
                  onClick={() => void shareToWhatsApp()}
                  title="Share portable invite link (+ video file when available) to WhatsApp"
                >
                  {whatsappBusy || exporting || portableBusy
                    ? portableBusy
                      ? "Preparing link…"
                      : exporting
                        ? `Exporting ${Math.round((exportProgress?.ratio ?? 0) * 100)}%`
                        : "Sharing…"
                    : "Share to WhatsApp"}
                </button>
              )}
              <button
                type="button"
                className={isInvitation ? "btn btn-ghost" : "btn btn-primary"}
                disabled={exporting}
                onClick={() => void exportShareVideo()}
                title="Encode WebM/MP4 in the browser from clips on this device"
              >
                {exporting
                  ? `Exporting ${Math.round((exportProgress?.ratio ?? 0) * 100)}%`
                  : "Export video"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!fromPortableHash && (portableBusy || !portableUrl)}
                onClick={() => void copy()}
              >
                {copied
                  ? "Copied!"
                  : !fromPortableHash && (portableBusy || !portableUrl)
                    ? "Preparing link…"
                    : "Copy invite link"}
              </button>
              {!fromPortableHash && portablePack && (
                <button
                  type="button"
                  className={
                    portableFlags?.chatTruncateRisk
                      ? "btn btn-primary"
                      : "btn btn-ghost"
                  }
                  onClick={() => downloadInvitePackJson(portablePack)}
                  title="Best for WhatsApp — works when chat apps truncate long URLs"
                >
                  Download invite pack
                </button>
              )}
              {!isInvitation && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={exporting || whatsappBusy || portableBusy}
                  onClick={() => void shareToWhatsApp()}
                >
                  Share to WhatsApp
                </button>
              )}
            </div>

            <p className="muted share-hint" style={{ marginTop: 10 }}>
              Link works in any browser — photos travel with the link. Full video: Export +
              WhatsApp.
              {portableFlags?.videosAsStills
                ? " Video clips become stills in the link."
                : ""}
              {portableFlags?.truncated
                ? " Some clips were omitted to keep the link small."
                : ""}
            </p>

            <label className="share-password-toggle">
              <input
                type="checkbox"
                checked={passwordOn}
                onChange={(e) => persistPassword(e.target.checked)}
              />
              <span>
                Require password
                <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                  Stored in project.share · local unlock stub
                </span>
              </span>
            </label>

            {status && (
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: 12 }}>
                {status}
              </p>
            )}

            <p className="muted share-hint">
              {isInvitation
                ? "Instagram & TikTok want uploads — use Export video. The invite link embeds photos for any browser; some chat apps truncate very long URLs — use Download invite pack or Export as backup."
                : "Instagram & TikTok rank uploads higher — export a file for those feeds; this link embeds photos for chats & sites."}
            </p>

            {!locked && (
              <section className="share-react-section" aria-label="Reactions">
                <div className="share-react-head">
                  <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Reactions</h3>
                  <EmojiPicker onSelect={onShareReact} label="😀＋" />
                </div>
                <QuickReactionBar onSelect={onShareReact} active={myReacts} />
                <div className="share-react-counts">
                  {Object.entries(shareReactions)
                    .sort((a, b) => b[1] - a[1])
                    .map(([emoji, count]) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`comment-react-chip${
                          myReacts.includes(emoji) ? " is-mine" : ""
                        }`}
                        onClick={() => onShareReact(emoji)}
                      >
                        {emoji} <span>{count}</span>
                      </button>
                    ))}
                  {Object.keys(shareReactions).length === 0 && (
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      Tap an emoji to react (stored locally)
                    </span>
                  )}
                </div>
              </section>
            )}

            {!locked && (
              <div className="share-title-edit">
                <label className="muted" style={{ fontSize: "0.8rem" }}>
                  Title / caption overlay (emoji welcome)
                </label>
                <div className="comment-compose-row">
                  <input
                    value={titleEdit}
                    onChange={(e) => setTitleEdit(e.target.value)}
                    onBlur={persistTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        persistTitle();
                      }
                    }}
                    aria-label="Share title"
                  />
                  <EmojiPicker
                    onSelect={(emoji) => {
                      setTitleEdit((t) => t + emoji);
                      rememberEmoji(emoji);
                    }}
                  />
                </div>
              </div>
            )}

            {!locked && <CommentThread shareId={record.id} />}
          </div>
        </div>

        <aside className="share-aside panel">
          <h3>Share details</h3>
          <dl className="share-dl">
            <dt>Share id</dt>
            <dd>
              <code>{record.id}</code>
            </dd>
            <dt>Theme</dt>
            <dd>{record.themeName}</dd>
            <dt>Audio</dt>
            <dd>
              {record.audioName}
              <div className="muted" style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>
                {record.audioTrackRef}
              </div>
            </dd>
            <dt>Clips</dt>
            <dd>{record.clipCount}</dd>
            <dt>Duration</dt>
            <dd>{formatDuration(record.durationSec)}</dd>
            <dt>Mode</dt>
            <dd>{isInvitation ? "Invitation" : "Voyage"}</dd>
            {isInvitation && record.invitation?.hostName && (
              <>
                <dt>Host</dt>
                <dd>{record.invitation.hostName}</dd>
              </>
            )}
            {isInvitation && record.invitation?.eventName && (
              <>
                <dt>Event</dt>
                <dd>{record.invitation.eventName}</dd>
              </>
            )}
            {isInvitation && record.invitation?.eventWhen && (
              <>
                <dt>When</dt>
                <dd>{record.invitation.eventWhen}</dd>
              </>
            )}
            <dt>Visibility</dt>
            <dd>{passwordOn ? "Password" : "Public link"}</dd>
          </dl>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            Host metadata lives in localStorage; the copyable link embeds a portable
            pack in the URL hash so guests need no local data. Same id is reused when
            you reopen Share from Compose.
          </p>
        </aside>
      </div>

      <p style={{ textAlign: "center", marginTop: 28 }}>
        <Link to="/create" className="muted" style={{ fontSize: "0.9rem" }}>
          ← Back to Compose
        </Link>
      </p>
    </div>
  );
}

/** /share route — ensure a share from draft then redirect to /v/:id */
export function ShareBootstrap() {
  const navigate = useNavigate();

  useEffect(() => {
    const draft = loadDraft();
    if (!draft) {
      navigate("/create", { replace: true });
      return;
    }
    const theme = getThemeById(draft.themeId);
    const beat = getBeatByRef(draft.audioTrackRef);
    const share = ensureShareFromDraft(draft, {
      themeName: theme?.name ?? "Theme",
      themeAccent: theme?.palette.accent ?? "#7C5CFF",
      themeGradient: theme?.gradient ?? "var(--grad-brand)",
      audioName: beat?.name ?? "Beat",
      audioBpm: beat?.bpm ?? 0,
    });
    if (draft.shareId !== share.id) {
      saveDraft({ ...draft, shareId: share.id });
    }
    const hash = window.location.hash || "";
    navigate(`/v/${share.id}${hash}`, { replace: true });
  }, [navigate]);

  return (
    <div className="share-page">
      <p className="muted" style={{ textAlign: "center" }}>
        Preparing share link…
      </p>
    </div>
  );
}
