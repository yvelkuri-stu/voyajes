import { useState } from "react";
import { Link } from "react-router-dom";
import { getBeats } from "../data/beats";
import { getThemes, transitionLabel, type ThemeCard } from "../data/themes";

export function Themes() {
  const themes = getThemes();
  const [selected, setSelected] = useState<ThemeCard>(themes[2] ?? themes[0]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="display" style={{ margin: "0 0 8px", fontSize: "1.75rem" }}>
          Theme picker
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          A theme is your look: colors, how things move, and how cuts feel.
        </p>
      </div>

      <div className="compose-layout">
        <div className="grid-themes">
          {themes.map((t) => {
            const active = selected?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className="card"
                onClick={() => setSelected(t)}
                style={{
                  padding: 0,
                  textAlign: "left",
                  color: "inherit",
                  borderColor: active ? t.palette.accent : undefined,
                  boxShadow: active ? `0 0 0 2px ${t.palette.accent}55` : undefined,
                }}
              >
                <div
                  className="theme-card-preview"
                  style={{ ["--theme-grad" as string]: t.gradient }}
                >
                  <span className={`badge badge-${t.tier === "free" ? "free" : "spark"}`}>
                    {t.tier}
                  </span>
                  <div style={{ marginTop: 8, fontWeight: 700, fontSize: "1.1rem" }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
                    {t.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <aside className="panel">
          <h3>Token inspector</h3>
          {selected && (
            <>
              <p style={{ margin: "0 0 12px", fontWeight: 600 }}>{selected.name}</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {Object.entries(selected.palette)
                  .filter(([k]) => k !== "grade")
                  .map(([key, color]) => (
                    <div key={key} style={{ textAlign: "center" }}>
                      <div
                        title={`${key}: ${color}`}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: color,
                          border: "1px solid var(--border-subtle)",
                        }}
                      />
                      <div className="muted" style={{ fontSize: "0.65rem", marginTop: 4 }}>
                        {key}
                      </div>
                    </div>
                  ))}
              </div>
              <dl
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt className="muted">Motion</dt>
                  <dd style={{ margin: 0 }}>{selected.motion}</dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt className="muted">Transition</dt>
                  <dd style={{ margin: 0 }}>{transitionLabel(selected.transition)}</dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt className="muted">Duration</dt>
                  <dd style={{ margin: 0 }}>{selected.transitionDurationMs}ms</dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt className="muted">Photo motion</dt>
                  <dd style={{ margin: 0 }}>{selected.photoMotion}</dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt className="muted">Pack</dt>
                  <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {selected.id}@{selected.version}
                  </dd>
                </div>
                {selected.suggestedBeatIds && selected.suggestedBeatIds.length > 0 && (
                  <div>
                    <dt className="muted" style={{ marginBottom: 6 }}>Suggested beats</dt>
                    <dd style={{ margin: 0 }}>
                      {selected.suggestedBeatIds
                        .map((id) => getBeats().find((b) => b.id === id)?.name ?? id)
                        .join(" · ")}
                    </dd>
                  </div>
                )}
              </dl>
              <Link
                to={`/create?theme=${encodeURIComponent(selected.id)}`}
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 20 }}
              >
                Use in Compose
              </Link>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
