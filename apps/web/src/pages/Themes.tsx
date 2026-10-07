import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  textStyleLabel,
  textTransitionLabel,
} from "@voyajes/core";
import { getBeats } from "../data/beats";
import {
  getThemes,
  transitionIcon,
  transitionLabel,
  type ThemeCard,
} from "../data/themes";
import {
  getKidsSafeTemplates,
  getInvitationTemplates,
  getTemplates,
  isInvitationTemplate,
  templateComboSummary,
  type TemplateCard,
} from "../data/templates";
import { usePrefs } from "../hooks/usePrefs";
import { KIDS_SAFE_THEME_IDS } from "../lib/prefsStore";

type Tab = "themes" | "templates";

export function Themes() {
  const [params, setParams] = useSearchParams();
  const { prefs } = usePrefs();
  const kidsMode = prefs.kidsMode;
  const tab: Tab = params.get("tab") === "templates" ? "templates" : "themes";
  const filterInvitation = params.get("filter") === "invitation";
  const themes = useMemo(
    () =>
      kidsMode
        ? getThemes().filter((t) =>
            (KIDS_SAFE_THEME_IDS as readonly string[]).includes(t.id),
          )
        : getThemes(),
    [kidsMode],
  );
  const templates = useMemo(() => {
    const base = kidsMode ? getKidsSafeTemplates() : getTemplates();
    if (filterInvitation) {
      const invites = getInvitationTemplates();
      if (!kidsMode) return invites;
      const kidsIds = new Set(base.map((t) => t.id));
      const filtered = invites.filter((t) => kidsIds.has(t.id));
      return filtered.length ? filtered : invites;
    }
    return base;
  }, [kidsMode, filterInvitation]);
  const [selectedTheme, setSelectedTheme] = useState<ThemeCard>(() => getThemes()[0]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateCard>(
    () => getTemplates()[0],
  );

  useEffect(() => {
    if (themes.length && !themes.some((t) => t.id === selectedTheme?.id)) {
      setSelectedTheme(themes[0]);
    }
  }, [kidsMode, themes, selectedTheme]);

  useEffect(() => {
    if (templates.length && !templates.some((t) => t.id === selectedTemplate?.id)) {
      setSelectedTemplate(templates[0]);
    }
  }, [kidsMode, templates, selectedTemplate]);

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === "themes") {
      p.delete("tab");
      p.delete("filter");
    } else {
      p.set("tab", next);
    }
    setParams(p, { replace: true });
  };

  const setTemplateFilter = (invitationOnly: boolean) => {
    const p = new URLSearchParams(params);
    p.set("tab", "templates");
    if (invitationOnly) p.set("filter", "invitation");
    else p.delete("filter");
    setParams(p, { replace: true });
  };

  const templateTheme = useMemo(
    () =>
      selectedTemplate
        ? getThemes().find((t) => t.id === selectedTemplate.themeId)
        : undefined,
    [selectedTemplate],
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="display" style={{ margin: "0 0 8px", fontSize: "1.75rem" }}>
          Themes &amp; Templates
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          Themes are the look. Templates are a full pack — motion, clip transitions,
          beat, text style, and text transitions — ready to apply in Compose.
          {kidsMode ? " Kids Mode shows a calmer subset." : ""}
        </p>
        <div className="chip-row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className={`chip${tab === "themes" ? " chip-active" : ""}`}
            onClick={() => setTab("themes")}
          >
            Themes ({themes.length})
          </button>
          <button
            type="button"
            className={`chip${tab === "templates" && !filterInvitation ? " chip-active" : ""}`}
            onClick={() => setTemplateFilter(false)}
          >
            Templates ({(kidsMode ? getKidsSafeTemplates() : getTemplates()).length})
          </button>
          <button
            type="button"
            className={`chip${tab === "templates" && filterInvitation ? " chip-active" : ""}`}
            onClick={() => setTemplateFilter(true)}
            title="Invitation packs for guest playback shares"
          >
            Invitations ({getInvitationTemplates().length})
          </button>
        </div>
      </div>

      {tab === "themes" ? (
        <div className="compose-layout">
          <div className="grid-themes">
            {themes.map((t) => {
              const active = selectedTheme?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="card"
                  onClick={() => setSelectedTheme(t)}
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
            {selectedTheme && (
              <>
                <p style={{ margin: "0 0 12px", fontWeight: 600 }}>{selectedTheme.name}</p>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {Object.entries(selectedTheme.palette)
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
                    <dd style={{ margin: 0 }}>{selectedTheme.motion}</dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <dt className="muted">Transition</dt>
                    <dd style={{ margin: 0 }}>{transitionLabel(selectedTheme.transition)}</dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <dt className="muted">Duration</dt>
                    <dd style={{ margin: 0 }}>{selectedTheme.transitionDurationMs}ms</dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <dt className="muted">Photo motion</dt>
                    <dd style={{ margin: 0 }}>{selectedTheme.photoMotion}</dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <dt className="muted">Pack</dt>
                    <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {selectedTheme.id}@{selectedTheme.version}
                    </dd>
                  </div>
                  {selectedTheme.suggestedBeatIds &&
                    selectedTheme.suggestedBeatIds.length > 0 && (
                      <div>
                        <dt className="muted" style={{ marginBottom: 6 }}>
                          Suggested beats
                        </dt>
                        <dd style={{ margin: 0 }}>
                          {selectedTheme.suggestedBeatIds
                            .map((id) => getBeats().find((b) => b.id === id)?.name ?? id)
                            .join(" · ")}
                        </dd>
                      </div>
                    )}
                </dl>
                <Link
                  to={`/create?theme=${encodeURIComponent(selectedTheme.id)}`}
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 20 }}
                >
                  Use theme in Compose
                </Link>
              </>
            )}
          </aside>
        </div>
      ) : (
        <div className="compose-layout">
          <div className="grid-themes">
            {templates.map((t) => {
              const active = selectedTemplate?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="card"
                  onClick={() => setSelectedTemplate(t)}
                  style={{
                    padding: 0,
                    textAlign: "left",
                    color: "inherit",
                    borderColor: active ? (t.theme?.palette.accent ?? "#7C5CFF") : undefined,
                    boxShadow: active
                      ? `0 0 0 2px ${(t.theme?.palette.accent ?? "#7C5CFF")}55`
                      : undefined,
                  }}
                >
                  <div
                    className="theme-card-preview"
                    style={{ ["--theme-grad" as string]: t.gradient }}
                  >
                    <span className={`badge badge-${t.tier === "free" ? "free" : "spark"}`}>
                      {t.tier}
                    </span>
                    {isInvitationTemplate(t) && (
                      <span className="badge badge-spark" style={{ marginLeft: 6 }}>
                        invitation
                      </span>
                    )}
                    <div style={{ marginTop: 8, fontWeight: 700, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: 8 }}>
                      {isInvitationTemplate(t) && (
                        <span aria-hidden style={{ fontSize: "1.25rem" }}>
                          {t.eventEmoji || "✉️"}
                        </span>
                      )}
                      {t.name}
                    </div>
                    <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
                      {isInvitationTemplate(t) ? (t.vibe || t.description) : t.description}
                    </div>
                    {isInvitationTemplate(t) && (
                      <div style={{ marginTop: 8, fontSize: "0.72rem", opacity: 0.9, fontWeight: 600 }}>
                        ♪ {t.beat?.name ?? t.beatId} · {t.aspect ?? "9:16"}
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: "0.72rem",
                        opacity: 0.85,
                        lineHeight: 1.35,
                      }}
                    >
                      {isInvitationTemplate(t)
                        ? `Includes: ${transitionIcon(t.transition)} ${transitionLabel(t.transition)} · ${t.textStyle.replace(/-/g, " ")} · ${t.motion}`
                        : templateComboSummary(t)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <aside className="panel">
            <h3>Template pack</h3>
            {selectedTemplate && (
              <>
                <p style={{ margin: "0 0 8px", fontWeight: 600 }}>{selectedTemplate.name}</p>
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
                  {selectedTemplate.description}
                </p>
                <dl
                  style={{
                    margin: "12px 0 0",
                    fontSize: "0.85rem",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Theme</dt>
                    <dd style={{ margin: 0 }}>{templateTheme?.name ?? selectedTemplate.themeId}</dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Motion</dt>
                    <dd style={{ margin: 0 }}>{selectedTemplate.motion}</dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Clip transition</dt>
                    <dd style={{ margin: 0 }}>
                      {transitionLabel(selectedTemplate.transition)}
                    </dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Beat</dt>
                    <dd style={{ margin: 0 }}>
                      {selectedTemplate.beat?.name ?? selectedTemplate.beatId}
                      {selectedTemplate.beat
                        ? ` · ${selectedTemplate.beat.bpm} BPM`
                        : ""}
                    </dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Beat-sync</dt>
                    <dd style={{ margin: 0 }}>{selectedTemplate.beatSync}</dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Text style</dt>
                    <dd style={{ margin: 0 }}>
                      {textStyleLabel(selectedTemplate.textStyle)}
                    </dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Text transition</dt>
                    <dd style={{ margin: 0 }}>
                      {textTransitionLabel(selectedTemplate.textTransition)}
                    </dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Aspect</dt>
                    <dd style={{ margin: 0 }}>{selectedTemplate.aspect ?? "—"}</dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Duration target</dt>
                    <dd style={{ margin: 0 }}>
                      {selectedTemplate.durationTargetSec
                        ? `${selectedTemplate.durationTargetSec}s`
                        : "—"}
                    </dd>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt className="muted">Pack</dt>
                    <dd
                      style={{
                        margin: 0,
                        fontFamily: "monospace",
                        fontSize: "0.72rem",
                      }}
                    >
                      {selectedTemplate.packRef}
                    </dd>
                  </div>
                </dl>
                <div
                  className={`text-style-preview text-style-${selectedTemplate.textStyle} text-tx-${selectedTemplate.textTransition}`}
                  style={{
                    marginTop: 16,
                    padding: 16,
                    borderRadius: 12,
                    background: templateTheme?.palette.bg ?? "var(--bg-elevated)",
                    color: templateTheme?.palette.text ?? "var(--text-primary)",
                    border: `1px solid ${templateTheme?.palette.accent ?? "var(--border-subtle)"}44`,
                  }}
                >
                  <div className="text-style-sample">Voyajes</div>
                  <div className="text-style-caption">
                    {textStyleLabel(selectedTemplate.textStyle)} ·{" "}
                    {textTransitionLabel(selectedTemplate.textTransition)}
                  </div>
                </div>
                <Link
                  to={
                    isInvitationTemplate(selectedTemplate)
                      ? `/create?mode=invitation&template=${encodeURIComponent(selectedTemplate.id)}`
                      : `/create?template=${encodeURIComponent(selectedTemplate.id)}`
                  }
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 20 }}
                >
                  {isInvitationTemplate(selectedTemplate)
                    ? "Apply invitation template"
                    : "Apply full template"}
                </Link>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
