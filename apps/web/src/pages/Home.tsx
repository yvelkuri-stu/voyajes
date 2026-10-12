import { CONTACT } from "../lib/legal";
import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { StartFreshSheet } from "../components/StartFresh";
import { brand } from "@voyajes/core";
import { loadDraft } from "../lib/draftStore";
import { startFresh, type FreshMode } from "../lib/startFresh";
import { getTemplates } from "../data/templates";
import { sampleCoverUrl } from "../data/samples";

/** v0.6 Focus: three actions, nothing else competing. */
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
        <div className="home-actions">
          <Link
            to="/create?fresh=1&onboard=1"
            className="btn btn-primary home-cta"
            data-home-story
            onClick={go("voyage", "/create?onboard=1")}
          >
            ✨ Make a story
          </Link>
          <Link
            to="/create?mode=invitation&fresh=1"
            className="btn btn-ghost home-cta-2"
            onClick={go("invitation", "/create?mode=invitation")}
          >
            💌 Make an invitation
          </Link>
          {draft && (
            <Link to="/create" className="btn btn-ghost home-cta-2" data-home-continue>
              ↻ Continue “{draft.title || "Untitled"}” · {draft.clips.length} clip{draft.clips.length === 1 ? "" : "s"}
            </Link>
          )}
        </div>
        <p className="vj-free-promise home-promise" data-free-promise>
          🆓 Free · <strong>no watermark, ever</strong> · no sign-up to share
        </p>
        {draft && (
          <button type="button" className="home-fresh" data-home-fresh onClick={() => setAsk(true)}>
            🧹 Start fresh
          </button>
        )}
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
