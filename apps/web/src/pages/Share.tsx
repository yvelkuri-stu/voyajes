import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { brand } from "@voyajes/core";
import { CommentThread } from "../components/CommentThread";
import { EmojiPicker, QuickReactionBar } from "../components/EmojiPicker";
import { InvitePlayer } from "../components/InvitePlayer";
import { Logo } from "../components/Logo";
import { getBeatByRef } from "../data/beats";
import { getThemeById } from "../data/themes";
import { assetUrl } from "../lib/assetUrl";
import {
  getShareReactions,
  toggleShareReaction,
  type ShareReactionMap,
} from "../lib/commentStore";
import { getBlob, loadDraft, saveDraft, type DraftState } from "../lib/draftStore";
import { rememberEmoji } from "../lib/emoji";
import {
  ensureShareFromDraft,
  formatDuration,
  getShare,
  publicShareUrl,
  updateShare,
  type ShareRecord,
} from "../lib/shareStore";

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

  // Resolve share: /v/:id or bootstrap from draft when visiting /share → redirected here
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      let share = routeId ? getShare(routeId) : null;
      const draft = loadDraft();

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
          navigate(`/v/${share.id}`, { replace: true });
          return;
        }
      }

      if (cancelled) return;

      if (!share) {
        setRecord(null);
        setReady(true);
        return;
      }

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
          // Video poster: use object URL in <video> poster frame via first frame
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
    };
  }, [routeId, navigate]);

  const shareUrl = useMemo(
    () => (record ? publicShareUrl(record.id) : `https://${brand.shareHost}/v/…`),
    [record],
  );

  const isVideoPoster =
    !!record?.posterMime?.startsWith("video/") && !!posterUrl;

  const copy = useCallback(async () => {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setStatus("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus("Could not copy — select the link manually");
    }
  }, [record, shareUrl]);

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
    return (
      <div className="share-page share-empty">
        <div className="share-empty-card">
          <Logo size={36} />
          <h1 className="display" style={{ margin: "16px 0 8px" }}>
            No voyage to share yet
          </h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Compose a draft first — then open Share to get a public link.
          </p>
          <Link to="/create" className="btn btn-primary" style={{ marginTop: 16 }}>
            Go to Compose
          </Link>
        </div>
      </div>
    );
  }

  const locked = passwordOn && !unlocked;
  const isInvitation = record.mode === "invitation";
  const showGuestInvite = isInvitation && !hostView && !locked;

  if (showGuestInvite) {
    return (
      <div className="share-page invite-page">
        <div className="invite-hero-label">
          <span aria-hidden>✉️</span> Invitation
        </div>
        <div className="share-header-row" style={{ marginBottom: 12 }}>
          <div>
            <h1 className="display share-title" style={{ margin: 0 }}>
              {record.title}
            </h1>
            <p className="muted share-subtitle" style={{ margin: "4px 0 0" }}>
              {formatDuration(record.durationSec)} · {record.themeName} · ♪ {record.audioName}
            </p>
          </div>
          <Logo size={32} />
        </div>

        {!guestPlaying ? (
          <div
            className="share-poster"
            style={{
              background: posterUrl
                ? undefined
                : record.themeGradient || "var(--grad-ocean)",
              maxWidth: 420,
              margin: "0 auto",
              borderRadius: 20,
              overflow: "hidden",
              position: "relative",
              aspectRatio: "9 / 16",
              maxHeight: "70vh",
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
              aria-label="Play invitation"
              onClick={() => setGuestPlaying(true)}
            >
              ▶
            </button>
            <div className="share-poster-caption">
              <div className="share-poster-title">{record.title}</div>
              <div className="share-poster-meta">
                Tap play · fullscreen animated invite
              </div>
            </div>
          </div>
        ) : (
          <InvitePlayer record={record} autoPlay />
        )}

        <div className="og-card invite-og" aria-label="Link preview">
          <div
            className="og-card-thumb"
            style={{
              backgroundImage:
                posterUrl && !isVideoPoster
                  ? `url(${posterUrl})`
                  : record.themeGradient,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="og-card-body">
            <div className="og-card-host">{brand.shareHost}</div>
            <div className="og-card-title">{record.title}</div>
            <div className="og-card-desc muted">
              Invitation · {record.themeName} · {record.audioName} · matches host design
            </div>
          </div>
        </div>

        <div className="share-link-box" title={shareUrl} style={{ marginTop: 12 }}>
          {shareUrl}
        </div>
        <div className="share-actions" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={() => void copy()}>
            {copied ? "Copied!" : "Copy invite link"}
          </button>
          {!guestPlaying && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setGuestPlaying(true)}
            >
              Play invite
            </button>
          )}
        </div>

        <section className="share-react-section" aria-label="Reactions" style={{ marginTop: 20 }}>
          <div className="share-react-head">
            <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>React</h3>
            <EmojiPicker onSelect={onShareReact} label="😀＋" />
          </div>
          <QuickReactionBar onSelect={onShareReact} active={myReacts} />
        </section>

        <CommentThread shareId={record.id} />

        <p className="muted invite-guest-note">
          Playback uses the host’s theme, transitions, audio &amp; text.
          Media loads from this browser’s draft store until cloud sync ships.
        </p>
        <p style={{ textAlign: "center", marginTop: 16 }}>
          <Link
            to={`/v/${record.id}?host=1`}
            className="muted"
            style={{ fontSize: "0.85rem" }}
          >
            Host controls →
          </Link>
          {" · "}
          <Link to="/create?mode=invitation" className="muted" style={{ fontSize: "0.85rem" }}>
            Create your own invite
          </Link>
        </p>
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

            <div className="share-link-box" title={shareUrl}>
              {shareUrl}
            </div>

            <div className="share-actions">
              <button type="button" className="btn btn-primary" onClick={() => void copy()}>
                {copied ? "Copied!" : "Copy link"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled
                title="Video encode not wired yet"
              >
                Download
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled
                title="TODO: embed"
              >
                Embed
              </button>
            </div>

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
              Instagram &amp; TikTok rank uploads higher — export a file for those
              feeds; use this link for chats &amp; sites. Encode stays stubbed.
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
            <dt>Visibility</dt>
            <dd>{passwordOn ? "Password" : "Public link"}</dd>
          </dl>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            Metadata lives in localStorage until cloud sync ships. Same id is
            reused when you reopen Share from Compose.
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
    navigate(`/v/${share.id}`, { replace: true });
  }, [navigate]);

  return (
    <div className="share-page">
      <p className="muted" style={{ textAlign: "center" }}>
        Preparing share link…
      </p>
    </div>
  );
}
