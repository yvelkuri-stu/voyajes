import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getThemes, getThemeById } from "../data/themes";

export function Create() {
  const [params] = useSearchParams();
  const themes = getThemes();
  const initial =
    getThemeById(params.get("theme") ?? "") ??
    themes.find((t) => t.id === "theme.ocean-pop") ??
    themes[0];

  const [themeId, setThemeId] = useState(initial.id);
  const [title, setTitle] = useState("Untitled voyage");
  const [aspect, setAspect] = useState("9:16");
  const theme = useMemo(
    () => getThemeById(themeId) ?? themes[0],
    [themeId, themes],
  );

  const clips = ["1", "2", "3", "4", "+"];

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
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Project title"
            style={{
              marginTop: 8,
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              fontSize: "1rem",
              fontFamily: "Sora, sans-serif",
              fontWeight: 600,
              width: "min(100%, 280px)",
              padding: "4px 0",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost">
            Export file
          </button>
          <Link to="/v/demo" className="btn btn-primary">
            Share
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <Link to="/themes" className="chip" title="Change theme">
          <span className="swatch" style={{ background: theme.palette.accent }} />
          Theme {theme.name}
        </Link>
        <span className="chip">Audio · Ocean Drift</span>
        <button
          type="button"
          className="chip"
          onClick={() =>
            setAspect((a) => (a === "9:16" ? "16:9" : a === "16:9" ? "1:1" : "9:16"))
          }
        >
          {aspect}
        </button>
        <span className="chip">Title</span>
      </div>

      <div className="compose-layout">
        <div>
          <div
            className="preview-stage"
            style={{
              aspectRatio: aspect === "16:9" ? "16/9" : aspect === "1:1" ? "1" : "9/16",
              width: aspect === "9:16" ? "min(100%, 360px)" : "100%",
              maxHeight: aspect === "9:16" ? "70vh" : 360,
            }}
          >
            <div
              className="grade"
              style={{ background: theme.gradient }}
            />
            <div className="preview-title" style={{ color: theme.palette.text }}>
              {title}
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  marginTop: 8,
                  opacity: 0.85,
                  fontFamily: "Inter, sans-serif",
                }}
              >
                Preview placeholder · {theme.transition} · {theme.motion}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              marginTop: 12,
              alignItems: "center",
            }}
          >
            <button type="button" className="btn btn-ghost" style={{ padding: "8px 16px" }}>
              ▶ Play
            </button>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              0:00 / 0:28
            </span>
          </div>

          <div className="filmstrip" aria-label="Clip filmstrip">
            {clips.map((c, i) => (
              <div
                key={c + i}
                className={`film-clip${i === 0 ? " active" : ""}`}
                style={
                  c !== "+"
                    ? {
                        background: `linear-gradient(145deg, #1C2230, ${theme.palette.accent}55)`,
                      }
                    : undefined
                }
              >
                {c}
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: "0.8rem", textAlign: "center" }}>
            Filmstrip stub — import &amp; trim come next. Studio timeline is opt-in later.
          </p>
        </div>

        <aside className="panel">
          <h3>Theme panel</h3>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            Live recolor of titles, grade, and default transition.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeId(t.id)}
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
          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--border-subtle)",
              margin: "16px 0",
            }}
          />
          <div style={{ fontSize: "0.8rem" }}>
            <div className="muted">Pack ref (CLI)</div>
            <code style={{ fontSize: "0.75rem" }}>
              {theme.id}@{theme.version}
            </code>
          </div>
        </aside>
      </div>
    </div>
  );
}
