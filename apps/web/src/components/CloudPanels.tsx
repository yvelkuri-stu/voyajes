import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  type HostView,
  type Social,
} from "../lib/api";
import type { PortablePackV1 } from "../lib/portableShare";
import { forkPackToDraft } from "../lib/remix";
import { loadDraft } from "../lib/draftStore";

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

  if (!s) return err ? <p className="muted vj-cloud-err">{err} — the story still plays.</p> : null;
  return (
    <section className="vj-guest-social" aria-label="React and join in">
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
          {s.myRsvp && <p className="muted">You said <strong>{s.myRsvp.answer}</strong> — change any time.</p>}
          <input className="vj-input" placeholder="Your name" value={name} maxLength={40} onChange={(e) => remember(e.target.value)} data-rsvp-name />
          <input className="vj-input" placeholder="Note for the host (optional)" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
          <input ref={rsvpFileRef} type="file" accept="image/*" hidden onChange={(e) => setRsvpPhoto(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn btn-ghost vj-small" onClick={() => rsvpFileRef.current?.click()}>
            {rsvpPhoto ? `📷 ${rsvpPhoto.name.slice(0, 18)}` : "📷 Add a photo (optional)"}
          </button>
          <div className="vj-rsvp-row">
            {(["yes", "maybe", "no"] as const).map((a) => (
              <button
                key={a}
                type="button"
                data-rsvp-answer={a}
                className={`btn ${s.myRsvp?.answer === a ? "btn-primary" : "btn-ghost"}`}
                disabled={!name.trim() || !!busy}
                onClick={() =>
                  void run("rsvp", async () => {
                    let mediaKey: string | undefined;
                    if (rsvpPhoto) mediaKey = (await dropFile(cloudId, rsvpPhoto, name, "rsvp")).key;
                    await postRsvp(cloudId, { name: name.trim(), answer: a, note: note.trim() || undefined, mediaKey });
                    setRsvpPhoto(null);
                  })
                }
              >
                {a === "yes" ? "🎉 Yes" : a === "maybe" ? "🤔 Maybe" : "😢 Can't"}
              </button>
            ))}
          </div>
          <p className="muted vj-small-text">
            {s.rsvpCounts.yes ?? 0} going · {s.rsvpCounts.maybe ?? 0} maybe · {s.rsvpCounts.no ?? 0} can't
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
                </button>
              );
            })}
          </div>
        </div>
      )}

      {s.dropsEnabled && (
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
          <button type="button" className="btn btn-primary" disabled={busy === "drop"} onClick={() => fileRef.current?.click()}>
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
        <ul className="vj-comment-list">
          {s.comments.map((c) => (
            <li key={c.id}>
              <strong>{c.name || "Guest"}</strong> {c.body}
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
      {err && <p className="muted vj-cloud-err" role="status">{err}</p>}
    </section>
  );
}

/** Host "Manage" panel for a published voyage. */
export function HostManage({ cloudId, pack, onPack }: { cloudId: string; pack: PortablePackV1; onPack?: (p: PortablePackV1) => void }) {
  const [h, setH] = useState<HostView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cur, setCur] = useState(pack);
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
  return (
    <section className="vj-manage" aria-label="Manage" data-manage>
      <h3>Manage</h3>
      <label className="toggle-row">
        <input type="checkbox" checked={h.dropsEnabled} data-drops-toggle onChange={(e) => void setDrops(cloudId, e.target.checked).then(load)} />
        <span>Let guests add photos (up to {h.dropsMax} each)</span>
      </label>
      {h.dropsEnabled && (
        <p className="muted vj-small-text">
          Contribution link: <code>{link}</code>
        </p>
      )}
      <div className="vj-manage-stats">
        {REACTION_EMOJIS.map((e) => (
          <span key={e}>
            {e} {h.reactions[e] ?? 0}
          </span>
        ))}
        <span>💬 {h.comments.length}</span>
      </div>
      <div className="vj-manage-actions">
        <button type="button" className="btn btn-ghost" onClick={() => reorder()}>
          ⭐ Promote favorites
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => reorder(5)}>
          ✨ Make highlights
        </button>
      </div>
      <h4>Photo drops {queue.length ? `· ${queue.length}` : ""}</h4>
      {queue.length === 0 && <p className="muted vj-small-text">No guest photos yet.</p>}
      <div className="vj-queue">
        {queue.map((d) => (
          <div key={d.id} className="vj-queue-item" data-drop-item>
            {d.mime.startsWith("video/") ? <video src={d.url} muted playsInline preload="metadata" /> : <img src={d.url} alt="" loading="lazy" />}
            <span className="vj-queue-who">{d.name || "Guest"}</span>
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
      {h.rsvps.length > 0 && (
        <>
          <h4>Guest list · {h.rsvps.filter((r) => r.answer === "yes").length} going</h4>
          <ul className="vj-guestlist" data-guestlist>
            {h.rsvps.map((r, i) => (
              <li key={i}>
                <span className={`vj-ans vj-ans-${r.answer}`}>{r.answer}</span> <strong>{r.name}</strong>
                {r.note ? <span className="muted"> — {r.note}</span> : null}
                {r.url ? <img src={r.url} alt="" className="vj-guest-photo" /> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {h.comments.length > 0 && (
        <>
          <h4>Comments</h4>
          <ul className="vj-comment-list">
            {h.comments.map((c) => (
              <li key={c.id}>
                <strong>{c.name || "Guest"}</strong> {c.body}{" "}
                <button type="button" className="vj-del" aria-label="Delete comment" onClick={() => void deleteComment(cloudId, c.id).then(load)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {err && <p className="muted vj-cloud-err">{err}</p>}
    </section>
  );
}
