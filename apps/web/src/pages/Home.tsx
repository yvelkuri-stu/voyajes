import { Link } from "react-router-dom";
import { useMemo } from "react";
import { brand } from "@voyajes/core";
import { loadDraft } from "../lib/draftStore";
import { markStartFresh } from "../lib/startFresh";
import { getTemplates } from "../data/templates";
import { sampleCoverUrl } from "../data/samples";

/** v0.6 Focus: three actions, nothing else competing. */
export function Home() {
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
            onClick={() => markStartFresh("voyage")}
          >
            ✨ Make a story
          </Link>
          <Link
            to="/create?mode=invitation&fresh=1"
            className="btn btn-ghost home-cta-2"
            onClick={() => markStartFresh("invitation")}
          >
            💌 Make an invitation
          </Link>
          {draft && (
            <Link to="/create" className="btn btn-ghost home-cta-2" data-home-continue>
              ↻ Continue “{draft.title || "Untitled"}” · {draft.clips.length} clip{draft.clips.length === 1 ? "" : "s"}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
