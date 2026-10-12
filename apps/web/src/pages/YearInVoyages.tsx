import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { computeYear, renderYearCard } from "../lib/yearRecap";
import { getBlob } from "../lib/draftStore";
import { shareOrDownload } from "../lib/webShare";
import { RouteIntro } from "../components/RouteIntro";
import { t } from "../lib/i18n";
import "../styles/storybrain.css";

const CARD_MS = 3800;

/** v1.1 Year in Voyages — Wrapped-style, auto-advancing, tap to skip. */
export function YearInVoyages() {
  const year = new Date().getFullYear();
  const r = useMemo(() => computeYear(year), [year]);
  const [i, setI] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!r.bestClipId) return;
    let url = "";
    void getBlob(r.bestClipId).then((b) => {
      if (!b) return;
      setBlob(b);
      url = URL.createObjectURL(b);
      setPhoto(url);
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [r.bestClipId]);
  const cards = [
    { k: "intro", bg: "linear-gradient(160deg,#ff4d8d,#7c5cff)", body: <><p className="yr-kicker">{t("year")}</p><h1 className="yr-big">{year}</h1><p>Let's look back ✨</p></> },
    { k: "stories", bg: "linear-gradient(160deg,#ffb347,#ff4d8d)", body: <><h1 className="yr-big" data-year-stories>{r.stories + r.invites}</h1><p>stories &amp; invites made{r.firstTitle ? <> — starting with “{r.firstTitle}”</> : null}</p></> },
    { k: "photos", bg: "linear-gradient(160deg,#00d1ff,#3ddc97)", body: <><h1 className="yr-big">{r.photos}</h1><p>photos turned into films{r.videos ? ` · ${r.videos} clips` : ""} · {r.minutes} min of motion</p></> },
    ...(r.route
      ? [{ k: "route", bg: "#0b1026", body: <><div className="yr-map"><RouteIntro route={r.route} loop /></div><p>{r.route.km.toLocaleString()} km · {r.places.length} places{r.places.length ? ` · ${r.places.slice(0, 4).join(", ")}` : ""}</p></> }]
      : r.days
        ? [{ k: "days", bg: "linear-gradient(160deg,#7c5cff,#00d1ff)", body: <><h1 className="yr-big">{r.days}</h1><p>days you captured</p></> }]
        : []),
    ...(r.topTheme ? [{ k: "theme", bg: r.topTheme.gradient, body: <><p className="yr-kicker">Your vibe</p><h1 className="yr-mid">{r.topTheme.name}</h1><p>used {r.topTheme.n}×</p></> }] : []),
    ...(photo ? [{ k: "best", bg: "#000", body: <><img className="yr-photo" src={photo} alt="Your best shot" /><p>Your best shot of the year</p></> }] : []),
    {
      k: "share",
      bg: "linear-gradient(160deg,#ff4d8d,#ffb347,#00d1ff)",
      body: (
        <>
          <h1 className="yr-mid">That was {year} 💫</h1>
          <button
            type="button"
            className="btn btn-primary"
            data-year-share
            onClick={async (e) => {
              e.stopPropagation();
              const png = await renderYearCard(r, blob);
              const how = await shareOrDownload(png, `voyajes-${year}.png`, `My ${year} in Voyages`);
              setMsg(how === "cancelled" ? null : how === "shared" ? "Shared ✨" : "Saved your year card");
            }}
          >
            Share my year
          </button>
          {msg && <p data-year-msg>{msg}</p>}
          <Link to="/create" className="yr-link" onClick={(e) => e.stopPropagation()}>Make another voyage →</Link>
        </>
      ),
    },
  ];
  const empty = r.stories + r.invites === 0;
  useEffect(() => {
    if (empty || i >= cards.length - 1) return;
    const tm = setTimeout(() => setI((n) => Math.min(cards.length - 1, n + 1)), CARD_MS);
    return () => clearTimeout(tm);
  }, [i, cards.length, empty]);
  if (empty)
    return (
      <main className="yr-page" style={{ background: "linear-gradient(160deg,#ff4d8d,#7c5cff)" }} data-year-empty>
        <div className="yr-card"><h1 className="yr-mid">{t("year")} {year}</h1><p>Your recap fills up as you make voyages on this device.</p><Link className="btn btn-primary" to="/create">Make your first voyage</Link></div>
      </main>
    );
  const c = cards[i];
  return (
    <main className="yr-page" style={{ background: c.bg }} onClick={() => setI((n) => Math.min(cards.length - 1, n + 1))} data-year data-year-card={c.k}>
      <div className="yr-bars">
        {cards.map((x, n) => (
          <span key={x.k} className={n < i ? "is-done" : n === i ? "is-now" : ""} style={{ animationDuration: `${CARD_MS}ms` }} />
        ))}
      </div>
      <div className="yr-card" key={c.k}>{c.body}</div>
      {i > 0 && <button type="button" className="yr-back" aria-label="Back" onClick={(e) => { e.stopPropagation(); setI(i - 1); }}>‹</button>}
    </main>
  );
}
