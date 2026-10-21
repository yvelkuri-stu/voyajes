import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  REACTION_EMOJIS,
  comment as postComment,
  deleteComment,
  dropFile,
  fetchHost,
  fetchSocial,
  heart,
  react,
  rsvp as postRsvp,
  setDrops,
  setDropStatus,
  shortUrlFor,
  updatePack,
  blockDevice,
  hideComment,
  resolveReport,
  postUpdate,
  deleteUpdate,
  attachPreview,
  type HostView,
  type Social,
} from "../lib/api";
import type { PortablePackV1 } from "../lib/portableShare";
import { forkPackToDraft } from "../lib/remix";
import { loadDraft } from "../lib/draftStore";
import { ReportSheet, type ReportTarget } from "./Moderation";
import { EventActions } from "./EventActions";
import { QrCardsPanel } from "./QrCardsPanel";
import { cardInfoFromPack, renderCover } from "../lib/cards";
import { AfterMovieHost } from "./AfterMovie";

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

const thumbOf = (pack: PortablePackV1, id: string) => {
  const e = pack.media[id];
  return e?.url || e?.dataUrl || undefined;
};

/** Animated "who's coming" ribbon under the player. */
export function AttendingRibbon({ names }: { names: string[] }) {
  if (!names.length) return null;
  const list = [...names, ...names];
  return (
    <div className="vj-attending" aria-label={`${names.length} going`}>
      <span className="vj-attending-label">Going · {names.length}</span>
      <div className="vj-attending-track">
        <div className="vj-attending-run" style={{ animationDuration: `${Math.max(10, names.length * 3)}s` }}>
          {list.map((n, i) => (
            <span key={i} className="vj-attending-name">
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Guest layer for cloud voyages: reactions, favorites, comments, drops, RSVP, Remix. */
export function GuestSocial({ cloudId, pack, isInvite }: { cloudId: string; pack: PortablePackV1; isInvite: boolean }) {
  const navigate = useNavigate();
  const [s, setS] = useState<Social | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(() => localStorage.getItem("voyajes.guestName") ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [burst, setBurst] = useState<{ e: string; k: number }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const rsvpFileRef = useRef<HTMLInputElement>(null);
  const [rsvpPhoto, setRsvpPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [plusOnes, setPlusOnes] = useState(0);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const inv = pack.share.playback?.invitation ?? pack.share.invitation;
  const maxPlus = inv?.plusOnesMax ?? 4;

  const load = useCallback(async () => {
    try {
      setS(await fetchSocial(cloudId));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [cloudId]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20000);
    return () => clearInterval(t);
  }, [load]);
  const remember = (n: string) => {
    setName(n);
    try {
      localStorage.setItem("voyajes.guestName", n);
    } catch {
      /* ignore */
    }
  };
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const clips = pack.share.playback?.clips ?? [];

  useEffect(() => {
    if (s?.myRsvp?.plusOnes != null) setPlusOnes(s.myRsvp.plusOnes);
  }, [s?.myRsvp?.plusOnes]);
  useEffect(() => {
    // table-card QR (?drop=1) jumps straight to the photo drop
    if (s && new URLSearchParams(location.search).get("drop") === "1")
      document.querySelector("[data-guest-drop]")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [!!s]);

  if (!s) return err ? <p className="muted vj-cloud-err">{err} — the story still plays.</p> : null;
  const deadline = s.rsvpDeadline ? new Date(s.rsvpDeadline) : null;
  return (
    <section className="vj-guest-social" aria-label="React and join in">
      {!!s.updates?.length && (
        <div className="vj-updates" data-host-updates aria-label="Updates from the host">
          {s.updates.slice(0, 3).map((u) => (
            <div key={u.id} className="vj-update">
              📣 {u.body}
              <small>from the host · {ago(u.created_at)}</small>
            </div>
          ))}
        </div>
      )}
      {isInvite && <EventActions inv={inv} title={inv?.eventName || pack.share.title} id={cloudId} url={shortUrlFor(cloudId)} />}
      {s.blocked && <p className="muted vj-cloud-err">The host has turned off posting from this device.</p>}
      <div className="vj-react-bar" role="group" aria-label="Reactions">
        {REACTION_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className="vj-react"
            data-react={e}
            onClick={() => {
              setBurst((b) => [...b.slice(-6), { e, k: Date.now() + Math.random() }]);
              setS((x) => (x ? { ...x, reactions: { ...x.reactions, [e]: (x.reactions[e] ?? 0) + 1 } } : x));
              void react(cloudId, e).catch((er) => setErr((er as Error).message));
            }}
          >
            <span aria-hidden>{e}</span>
            <span className="vj-react-n">{s.reactions[e] ?? 0}</span>
          </button>
        ))}
        <span className="vj-react-burst" aria-hidden>
          {burst.map((b) => (
            <span key={b.k}>{b.e}</span>
          ))}
        </span>
      </div>

      {isInvite && (
        <div className="vj-rsvp" data-rsvp>
          <h3>Are you coming?</h3>
          {s.myRsvp && (
            <p className="muted">
              You said <strong>{s.myRsvp.answer}</strong>
              {s.myRsvp.plusOnes ? ` (+${s.myRsvp.plusOnes})` : ""}
              {s.rsvpClosed ? "." : " — change any time."}
            </p>
          )}
          {deadline && (
            <p className={`muted vj-small-text${s.rsvpClosed ? " vj-closed" : ""}`} data-rsvp-deadline-note>
              {s.rsvpClosed
                ? "RSVPs are closed."
                : `Please reply by ${deadline.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`}
            </p>
          )}
          <input className="vj-input" placeholder="Your name" value={name} maxLength={40} onChange={(e) => remember(e.target.value)} data-rsvp-name />
          <input className="vj-input" placeholder="Note for the host (optional)" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
          <input ref={rsvpFileRef} type="file" accept="image/*" hidden onChange={(e) => setRsvpPhoto(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn btn-ghost vj-small" onClick={() => rsvpFileRef.current?.click()}>
            {rsvpPhoto ? `📷 ${rsvpPhoto.name.slice(0, 18)}` : "📷 Add a photo (optional)"}
          </button>
          {maxPlus > 0 && !s.rsvpClosed && (
            <div className="vj-plus" data-plus-ones>
              <span className="muted">Bringing anyone?</span>
              <button type="button" className="btn btn-ghost" aria-label="Fewer guests" disabled={plusOnes <= 0} onClick={() => setPlusOnes((n) => Math.max(0, n - 1))}>
                −
              </button>
              <strong data-plus-ones-value>+{plusOnes}</strong>
              <button type="button" className="btn btn-ghost" aria-label="More guests" data-plus-ones-inc disabled={plusOnes >= maxPlus} onClick={() => setPlusOnes((n) => Math.min(maxPlus, n + 1))}>
                +
              </button>
            </div>
          )}
          <div className="vj-rsvp-row">
            {(["yes", "maybe", "no"] as const).map((a) => (
              <button
                key={a}
                type="button"
                data-rsvp-answer={a}
                className={`btn ${s.myRsvp?.answer === a ? "btn-primary" : "btn-ghost"}`}
                disabled={!name.trim() || !!busy || !!s.rsvpClosed || !!s.blocked}
                onClick={() =>
                  void run("rsvp", async () => {
                    let mediaKey: string | undefined;
                    if (rsvpPhoto) mediaKey = (await dropFile(cloudId, rsvpPhoto, name, "rsvp")).key;
                    await postRsvp(cloudId, { name: name.trim(), answer: a, note: note.trim() || undefined, mediaKey, plusOnes: a === "yes" ? plusOnes : 0 });
                    setRsvpPhoto(null);
                  })
                }
              >
                {a === "yes" ? "🎉 Yes" : a === "maybe" ? "🤔 Maybe" : "😢 Can't"}
              </button>
            ))}
          </div>
          <p className="muted vj-small-text">
            <span data-guest-count>{s.guestCount ?? s.rsvpCounts.yes ?? 0} guests</span> · {s.rsvpCounts.yes ?? 0} yes · {s.rsvpCounts.maybe ?? 0} maybe ·{" "}
            {s.rsvpCounts.no ?? 0} can't
          </p>
        </div>
      )}

      {clips.length > 1 && (
        <div className="vj-favs" aria-label="Favorite moments">
          <h3>Favorite moments</h3>
          <div className="vj-favs-row">
            {clips.map((c, i) => {
              const mine = s.myHearts.includes(i);
              const t = thumbOf(pack, c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`vj-fav${mine ? " is-mine" : ""}`}
                  data-heart={i}
                  aria-pressed={mine}
                  onClick={() => void run("heart", () => heart(cloudId, i))}
                >
                  {t ? <img src={t} alt="" loading="lazy" /> : <span className="vj-fav-ph" />}
                  <span className="vj-fav-n">{mine ? "♥" : "♡"} {s.hearts[i] ?? 0}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="vj-flag vj-fav-flag"
                    aria-label="Report photo"
                    data-report-clip={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      setReporting({ targetType: "clip", targetId: c.id, label: "photo" });
                    }}
                  >
                    ⚑
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {s.dropsEnabled && !s.blocked && (
        <div className="vj-drop" data-guest-drop>
          <h3>Add your photos</h3>
          <p className="muted vj-small-text">The host reviews them before they join the story.</p>
          {!isInvite && <input className="vj-input" placeholder="Your name (optional)" value={name} maxLength={40} onChange={(e) => remember(e.target.value)} />}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            multiple
            hidden
            data-guest-drop-input
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void run("drop", async () => {
                for (const f of files) await dropFile(cloudId, f, name || undefined);
                setErr(`Sent ${files.length} — thanks! The host will add favourites.`);
              });
            }}
          />
          <button type="button" className={`btn ${isInvite ? "btn-soft" : "btn-primary"}`} disabled={busy === "drop"} onClick={() => fileRef.current?.click()}>
            {busy === "drop" ? "Uploading…" : "＋ Add photos"}
          </button>
        </div>
      )}

      <div className="vj-comments">
        <h3>Comments</h3>
        <form
          className="vj-comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const body = text;
            setText("");
            void run("comment", () => postComment(cloudId, name, body));
          }}
        >
          {!isInvite && !s.dropsEnabled && <input className="vj-input vj-input-name" placeholder="Name" value={name} maxLength={40} onChange={(e) => remember(e.target.value)} />}
          <input className="vj-input" placeholder="Say something nice…" value={text} maxLength={280} onChange={(e) => setText(e.target.value)} data-comment-input />
          <button type="submit" className="btn btn-ghost" disabled={!text.trim()}>
            Post
          </button>
        </form>
        <p className="muted vj-small-text vj-terms-note" data-terms-note>
          By posting you agree to the <Link to="/terms">Terms</Link> — be kind; hosts can hide posts and anyone can report ⚑.
        </p>
        <ul className="vj-comment-list">
          {s.comments.map((c) => (
            <li key={c.id}>
              <strong>{c.name || "Guest"}</strong> {c.body}{" "}
              <button type="button" className="vj-flag" aria-label="Report comment" data-report-comment={c.id} onClick={() => setReporting({ targetType: "comment", targetId: c.id, label: "comment" })}>
                ⚑
              </button>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        className="btn btn-ghost vj-remix"
        data-remix
        disabled={busy === "remix"}
        onClick={() => {
          const d = loadDraft();
          if (d && d.clips.length && !window.confirm("Replace your current draft on this device with a copy of this story?")) return;
          void (async () => {
            setBusy("remix");
            try {
              await forkPackToDraft(pack, (m) => setErr(m));
              navigate("/create");
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(null);
            }
          })();
        }}
      >
        {busy === "remix" ? "Copying…" : "✂️ Make your version"}
      </button>
      <button
        type="button"
        className="vj-flag vj-report-link"
        data-report-voyage
        onClick={() => setReporting({ targetType: "voyage", label: isInvite ? "this invitation" : "this voyage" })}
      >
        ⚑ Report {isInvite ? "invitation" : "voyage"}
      </button>
      {reporting && <ReportSheet cloudId={cloudId} target={reporting} onClose={() => setReporting(null)} />}
      {err && <p className="muted vj-cloud-err" role="status">{err}</p>}
    </section>
  );
}

/** Host "Manage" panel for a published voyage. */
type ManageTab = "guests" | "photos" | "share" | "after";

export function HostManage({ cloudId, pack, onPack }: { cloudId: string; pack: PortablePackV1; onPack?: (p: PortablePackV1) => void }) {
  const [h, setH] = useState<HostView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cur, setCur] = useState(pack);
  const [upd, setUpd] = useState("");
  const [tab, setTab] = useState<ManageTab>(() => {
    try {
      return (sessionStorage.getItem(`vj-manage-tab:${cloudId}`) as ManageTab | null) ?? "guests";
    } catch {
      return "guests";
    }
  });
  const load = useCallback(async () => {
    try {
      setH(await fetchHost(cloudId));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [cloudId]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);
  const save = async (next: PortablePackV1, msg: string) => {
    await updatePack(cloudId, next);
    setCur(next);
    onPack?.(next);
    setErr(msg);
  };
  const clips = cur.share.playback?.clips ?? [];
  const hearts = h?.hearts ?? {};
  const reorder = (keepTop?: number) => {
    const pb = cur.share.playback;
    if (!pb) return;
    const ranked = clips.map((c, i) => ({ c, n: hearts[i] ?? 0, i })).sort((a, b) => b.n - a.n || a.i - b.i);
    const pick = keepTop ? ranked.filter((r) => r.n > 0).slice(0, keepTop) : ranked;
    if (!pick.length) return setErr("No hearts yet — share the link first");
    const order = keepTop ? pick.sort((a, b) => a.i - b.i) : pick;
    const next = { ...cur, share: { ...cur.share, clipCount: order.length, playback: { ...pb, clips: order.map((r) => r.c) } } };
    void save(next, keepTop ? `Highlights · ${order.length} most-loved moments` : "Favorites moved to the front");
  };
  const addToStory = async (d: HostView["drops"][number]) => {
    const pb = cur.share.playback;
    if (!pb) return;
    const id = `drop-${d.id}`;
    const isVideo = d.mime.startsWith("video/");
    const next: PortablePackV1 = {
      ...cur,
      media: { ...cur.media, [id]: { dataUrl: "", url: d.url, kind: isVideo ? "video" : "image" } },
      share: {
        ...cur.share,
        clipCount: pb.clips.length + 1,
        playback: {
          ...pb,
          clips: [...pb.clips, { id, fileName: d.name ? `from ${d.name}` : "guest photo", mimeType: d.mime, kind: isVideo ? "video" : "image", durationSec: 2.6, mute: true, transitionOut: null }],
        },
      },
    };
    await save(next, `Added ${d.name ? d.name + "'s" : "a guest"} photo to the story`);
    await setDropStatus(cloudId, d.id, "added");
    await load();
  };
  const link = shortUrlFor(cloudId);
  if (!h) return <p className="muted">{err ?? "Loading guest activity…"}</p>;
  const queue = h.drops.filter((d) => d.status === "pending" || d.status === "accepted");
  const blocked = new Set(h.blocked ?? []);
  const act = (p: Promise<unknown>, msg?: string) =>
    void p.then(() => (msg ? setErr(msg) : undefined)).then(load).catch((e) => setErr((e as Error).message));
  const BlockBtn = ({ device }: { device?: string }) =>
    device ? (
      <button
        type="button"
        className="vj-flag"
        data-block-device={device}
        title={blocked.has(device) ? "Allow this device again" : "Block this device from posting"}
        onClick={() => act(blockDevice(cloudId, device, !blocked.has(device)), blocked.has(device) ? "Unblocked" : "Blocked — their comments are hidden")}
      >
        {blocked.has(device) ? "↺ Unblock" : "⛔ Block"}
      </button>
    ) : null;
  const isInvite = cur.share.mode === "invitation";
  const tabs: { id: ManageTab; label: string; icon: string; count?: number }[] = [
    { id: "guests", label: isInvite ? "Guests & RSVP" : "Guests", icon: "👥", count: isInvite ? h.rsvps.filter((r) => r.answer === "yes").length : undefined },
    { id: "photos", label: "Photos & moderation", icon: "🖼️", count: queue.length + (h.reports?.length ?? 0) || undefined },
    { id: "share", label: "Share & print", icon: "🔗" },
    ...(isInvite ? [{ id: "after" as ManageTab, label: "After-movie", icon: "🎬" }] : []),
  ];
  const active: ManageTab = tabs.some((t) => t.id === tab) ? tab : "guests";
  const pick = (id: ManageTab) => {
    setTab(id);
    try {
      sessionStorage.setItem(`vj-manage-tab:${cloudId}`, id);
    } catch {
      /* private mode */
    }
  };
  return (
    <section className="vj-manage" aria-label="Manage" data-manage>
      <h3 className="vj-sec-h"><span aria-hidden>🛠️</span> Manage</h3>
      <div className="vj-tabs" role="tablist" aria-label="Manage sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`vj-mt-${t.id}`}
            aria-controls={`vj-mp-${t.id}`}
            aria-selected={active === t.id}
            className="vj-tab"
            data-manage-tab={t.id}
            onClick={(e) => {
              pick(t.id);
              e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
            }}
          >
            <span aria-hidden>{t.icon}</span> {t.label}
            {t.count ? <span className="vj-tab-count">· {t.count}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="vj-mp-guests" aria-labelledby="vj-mt-guests" className="vj-tabpanel" hidden={active !== "guests"} data-manage-panel="guests">
          <div className="vj-manage-stats">
            {REACTION_EMOJIS.map((e) => (
              <span key={e}>
                {e} {h.reactions[e] ?? 0}
              </span>
            ))}
            <span>💬 {h.comments.length}</span>
          </div>
          {h.rsvps.length > 0 && (
            <>
              <h4 data-host-headcount>
                Guest list · {h.rsvps.filter((r) => r.answer === "yes").length} yes · {h.guestCount ?? 0} guests incl. +1s
              </h4>
              <ul className="vj-guestlist" data-guestlist>
                {h.rsvps.map((r, i) => (
                  <li key={i}>
                    <span className={`vj-ans vj-ans-${r.answer}`}>{r.answer}</span> <strong>{r.name}</strong>
                    {r.plus_ones ? <span className="muted"> +{r.plus_ones}</span> : null}
                    {r.note ? <span className="muted"> — {r.note}</span> : null}
                    {r.url ? <img src={r.url} alt="" className="vj-guest-photo" /> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        {h.rsvps.length === 0 && <p className="muted vj-small-text">{isInvite ? "No RSVPs yet — share the link and they'll appear here." : "Reactions and guest activity appear here."}</p>}
          <h4>Updates for guests</h4>
          <form
            className="vj-comment-form"
            data-host-update-form
            onSubmit={(e) => {
              e.preventDefault();
              if (!upd.trim()) return;
              const body = upd;
              setUpd("");
              act(postUpdate(cloudId, body), "Posted — guests see it on the invite");
            }}
          >
            <input className="vj-input" placeholder="e.g. Parking is behind the hall 🚗" value={upd} maxLength={500} onChange={(e) => setUpd(e.target.value)} data-host-update-input />
            <button type="submit" className="btn btn-ghost" disabled={!upd.trim()}>
              Post
            </button>
          </form>
          {!!h.updates?.length && (
            <ul className="vj-comment-list">
              {h.updates.map((u) => (
                <li key={u.id}>
                  📣 {u.body} <span className="muted vj-small-text">{ago(u.created_at)}</span>{" "}
                  <button type="button" className="vj-del" aria-label="Delete update" onClick={() => act(deleteUpdate(cloudId, u.id))}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
      <div role="tabpanel" id="vj-mp-photos" aria-labelledby="vj-mt-photos" className="vj-tabpanel" hidden={active !== "photos"} data-manage-panel="photos">
          <label className="toggle-row">
            <input type="checkbox" checked={h.dropsEnabled} data-drops-toggle onChange={(e) => void setDrops(cloudId, e.target.checked).then(load)} />
            <span>Let guests add photos (up to {h.dropsMax} each)</span>
          </label>
          {h.dropsEnabled && (
            <p className="muted vj-small-text">
              Contribution link: <code>{link}</code>
            </p>
          )}
          <h4>Photo drops {queue.length ? `· ${queue.length}` : ""}</h4>
          {queue.length === 0 && <p className="muted vj-small-text">No guest photos yet.</p>}
          <div className="vj-queue">
            {queue.map((d) => (
              <div key={d.id} className="vj-queue-item" data-drop-item>
                {d.mime.startsWith("video/") ? <video src={d.url} muted playsInline preload="metadata" /> : <img src={d.url} alt="" loading="lazy" />}
                <span className="vj-queue-who">
                  {d.name || "Guest"} <BlockBtn device={d.device_id} />
                </span>
                <div className="vj-queue-btns">
                  <button type="button" className="btn btn-primary vj-small" data-drop-add onClick={() => void addToStory(d)}>
                    Add to story
                  </button>
                  <button type="button" className="btn btn-ghost vj-small" onClick={() => void setDropStatus(cloudId, d.id, "rejected").then(load)}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="vj-manage-actions">
            <button type="button" className="btn btn-ghost" onClick={() => reorder()}>
              ⭐ Promote favorites
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => reorder(5)}>
              ✨ Make highlights
            </button>
          </div>
          {!!h.reports?.length && (
            <>
              <h4 data-host-reports>Reports · {h.reports.length}</h4>
              <ul className="vj-comment-list">
                {h.reports.map((r) => {
                  const c = r.target_type === "comment" ? h.comments.find((x) => x.id === r.target_id) : undefined;
                  return (
                    <li key={r.id} data-report-item>
                      <span className={`vj-ans vj-ans-no`}>{r.reason}</span> {r.target_type}
                      {c ? <> — “{c.body}”</> : null}
                      {r.note ? <span className="muted"> · {r.note}</span> : null}{" "}
                      {c && (
                        <button type="button" className="vj-flag" data-report-hide onClick={() => act(hideComment(cloudId, c.id, true), "Comment hidden")}>
                          Hide
                        </button>
                      )}
                      {c && <BlockBtn device={c.device_id} />}
                      <button type="button" className="vj-flag" data-report-dismiss onClick={() => act(resolveReport(cloudId, r.id, "dismissed"))}>
                        Dismiss
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {h.comments.length > 0 && (
            <>
              <h4>Comments</h4>
              <ul className="vj-comment-list">
                {h.comments.map((c) => (
                  <li key={c.id} className={c.hidden ? "vj-hidden-row" : undefined}>
                    <strong>{c.name || "Guest"}</strong> {c.body} {c.hidden ? <span className="muted">(hidden)</span> : null}{" "}
                    <button type="button" className="vj-flag" data-hide-comment={c.id} onClick={() => act(hideComment(cloudId, c.id, !c.hidden))}>
                      {c.hidden ? "Show" : "Hide"}
                    </button>
                    <BlockBtn device={c.device_id} />
                    <button type="button" className="vj-del" aria-label="Delete comment" onClick={() => void deleteComment(cloudId, c.id).then(load)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
      </div>
      <div role="tabpanel" id="vj-mp-share" aria-labelledby="vj-mt-share" className="vj-tabpanel" hidden={active !== "share"} data-manage-panel="share">
          <QrCardsPanel pack={cur} url={link} />
          <button
            type="button"
            className="btn btn-ghost vj-small"
            data-refresh-cover
            onClick={() =>
              act(
                renderCover(cardInfoFromPack(cur, link)).then((b) => attachPreview(cloudId, b, "coverKey")),
                "Link preview refreshed — WhatsApp may cache the old one for a while",
              )
            }
          >
            🖼 Refresh link preview
          </button>
      </div>
      {isInvite && (
        <div role="tabpanel" id="vj-mp-after" aria-labelledby="vj-mt-after" className="vj-tabpanel" hidden={active !== "after"} data-manage-panel="after">
          <AfterMovieHost cloudId={cloudId} pack={cur} />
        </div>
      )}
      {err && <p className="muted vj-cloud-err">{err}</p>}
    </section>
  );
}
