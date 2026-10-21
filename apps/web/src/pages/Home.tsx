import "../styles/storybrain.css";
import { CONTACT } from "../lib/legal";
import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { StartFreshSheet } from "../components/StartFresh";
import { brand } from "@voyajes/core";
import { loadDraft } from "../lib/draftStore";
import { startFresh, type FreshMode } from "../lib/startFresh";
import { getTemplates } from "../data/templates";
import { sampleCoverUrl } from "../data/samples";

/** v1.2 Focus: 2–3 big intent cards, nothing else competing. */
export function Home() {
  const navigate = useNavigate();
  const [ask, setAsk] = useState(false);
  const go = (mode: FreshMode, to: string) => async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    await startFresh(mode, { remount: false });
    navigate(to);
  };
  const draft = useMemo(() => {
    try {
      const d = loadDraft();
      return d && d.clips.length > 0 ? d : null;
    } catch {
      return null;
    }
  }, []);
  const covers = useMemo(
    () =>
      getTemplates()
        .map((t) => sampleCoverUrl(t.id))
        .filter((u): u is string => !!u)
        .filter((_, i) => i % 3 === 0)
        .slice(0, 8),
    [],
  );

  return (
    <div className="home-focus">
      <section className="home-hero">
        <div className="home-strip" aria-hidden>
          {covers.map((u, i) => (
            <img key={u} src={u} alt="" style={{ animationDelay: `${i * -2.2}s` }} draggable={false} />
          ))}
        </div>
        <p className="home-kicker">{brand.name.toUpperCase()}</p>
        <h1 className="display home-title">Your voyage starts here</h1>
        <p className="muted home-sub">
          Drop 5–10 photos → get a 15–30s cinematic story in under 2 minutes. Pick a vibe, we do the edit, you share
          a link.
        </p>
        <nav className="vj-intents" aria-label="What do you want to make?">
          <Link
            to="/create?fresh=1&onboard=1"
            className="vj-intent is-primary"
            data-home-story
            data-intent="story"
            onClick={go("voyage", "/create?onboard=1")}
          >
            <span className="vj-intent-ic" aria-hidden>✨</span>
            <span className="vj-intent-txt">
              <span className="vj-intent-t">Make a story</span>
              <span className="vj-intent-s">Photos in → cinematic story out</span>
            </span>
            <span className="vj-intent-go" aria-hidden>→</span>
          </Link>
          <Link
            to="/create?mode=invitation&fresh=1"
            className="vj-intent is-invite"
            data-intent="invitation"
            onClick={go("invitation", "/create?mode=invitation")}
          >
            <span className="vj-intent-ic" aria-hidden>💌</span>
            <span className="vj-intent-txt">
              <span className="vj-intent-t">Make an invitation</span>
              <span className="vj-intent-s">Birthdays, weddings, ceremonies · RSVP built in</span>
            </span>
            <span className="vj-intent-go" aria-hidden>→</span>
          </Link>
          {draft ? (
            <Link to="/create" className="vj-intent is-drafts" data-home-continue data-intent="continue">
              <span className="vj-intent-ic" aria-hidden>↻</span>
              <span className="vj-intent-txt">
                <span className="vj-intent-t">Continue draft</span>
                <span className="vj-intent-s">
                  “{draft.title || "Untitled"}” · {draft.clips.length} clip{draft.clips.length === 1 ? "" : "s"}
                </span>
              </span>
              <span className="vj-intent-go" aria-hidden>→</span>
            </Link>
          ) : (
            <Link to="/themes?tab=templates" className="vj-intent is-drafts" data-intent="templates">
              <span className="vj-intent-ic" aria-hidden>🪔</span>
              <span className="vj-intent-txt">
                <span className="vj-intent-t">Start from a template</span>
                <span className="vj-intent-s">Ready-made samples · new: Ceremonies</span>
              </span>
              <span className="vj-intent-go" aria-hidden>→</span>
            </Link>
          )}
        </nav>
        <p className="vj-free-promise home-promise" data-free-promise>
          🆓 Free · <strong>no watermark, ever</strong> · no sign-up to share
        </p>
        <div className="vj-home-extras">
          <Link to="/year" className="home-year" data-home-year>
            ✨ Your {new Date().getFullYear()} in Voyages
          </Link>
          {draft && (
            <button type="button" className="home-fresh" data-home-fresh onClick={() => setAsk(true)}>
              🧹 Start fresh
            </button>
          )}
        </div>
      </section>
      <p className="muted home-legal" style={{ textAlign: "center", fontSize: ".75rem", margin: "18px 0" }}>
        <Link to="/terms" data-home-terms>Terms</Link> · <Link to="/privacy">Privacy</Link> · <a href={CONTACT.href}>Contact</a>
      </p>
      <StartFreshSheet
        open={ask}
        onCancel={() => setAsk(false)}
        onConfirm={() => {
          setAsk(false);
          void go("voyage", "/create")();
        }}
      />
    </div>
  );
}
