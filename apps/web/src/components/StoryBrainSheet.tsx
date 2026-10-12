import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LANGS, PHRASES, getLang, setLang, t, type Lang } from "../lib/i18n";
import { buildRoute, pickBest, planFromPrompt, type ClipBrain, type StoryPlan } from "../lib/storyBrain";
import type { StoryBrainSettings } from "../lib/draftStore";
import { RouteIntro } from "./RouteIntro";
import "../styles/storybrain.css";

type C = { id: string; kind: string; objectUrl: string; brain?: ClipBrain };
const EXAMPLES: Record<string, string[]> = {
  en: ["Fast reel of our Goa trip, best 8", "Slow cinematic family weekend", "Birthday party in Hindi"],
  hi: ["गोवा ट्रिप की तेज़ रील", "परिवार के साथ सुकून के पल"],
  te: ["మా ప్రయాణం జ్ఞాపకాలు", "పుట్టినరోజు పార్టీ"],
  ta: ["எங்கள் பயண நினைவுகள்", "குடும்ப நாட்கள்"],
};

/** v1.1 Story Brain: prompt → story, best shots, smart crop, route-map intro, Indian-language captions. */
export function StoryBrainSheet({
  clips,
  settings,
  accent,
  onClose,
  onPlan,
  onKeep,
  onSettings,
}: {
  clips: C[];
  settings: StoryBrainSettings | undefined;
  accent?: string;
  onClose: () => void;
  onPlan: (p: StoryPlan) => void;
  onKeep: (ids: string[]) => void;
  onSettings: (s: StoryBrainSettings) => void;
}) {
  const [lang, setL] = useState<Lang>(() => (settings?.lang as Lang) || getLang());
  const [prompt, setPrompt] = useState(settings?.prompt ?? "");
  const [done, setDone] = useState<string | null>(null);
  const route = useMemo(() => buildRoute(clips), [clips]);
  const analysed = clips.filter((c) => c.brain?.score != null).length;
  const focused = clips.filter((c) => c.brain?.fx != null).length;
  const best = useMemo(() => pickBest(clips), [clips]);
  const [keepN, setKeepN] = useState(() => Math.max(1, Math.min(best.kept.length, 10)));
  const pickLang = (l: Lang) => {
    setL(l);
    setLang(l);
    onSettings({ ...settings, lang: l });
  };
  const make = () => {
    const plan = planFromPrompt(prompt || PHRASES[lang].default.title, { route, fallbackLang: lang });
    if (plan.lang !== lang) pickLang(plan.lang);
    onPlan(plan);
    setDone(`✨ ${plan.title} · ${plan.pace} · ${plan.keep ? `best ${plan.keep}` : `${clips.length} shots`}${plan.routeIntro ? " · route map" : ""}`);
  };
  // portal: the editor root is its own stacking context, so render above the top nav
  return createPortal(
    <div className="sb-backdrop" role="dialog" aria-label={t("brain", lang)} onClick={onClose}>
      <div className="sb-sheet" onClick={(e) => e.stopPropagation()} data-story-brain>
        <header className="sb-head">
          <span className="sb-orb" aria-hidden />
          <h2>{t("brain", lang)}</h2>
          <button type="button" className="sb-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="sb-langs" role="radiogroup" aria-label={t("lang", lang)}>
          {LANGS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} className={`sb-lang${lang === l.id ? " is-on" : ""}`} data-lang={l.id} onClick={() => pickLang(l.id)}>
              {l.native}
            </button>
          ))}
        </div>

        <label className="sb-label" htmlFor="sb-prompt">
          {t("prompt", lang)}
        </label>
        <textarea id="sb-prompt" className="sb-prompt" rows={2} value={prompt} maxLength={300} onChange={(e) => setPrompt(e.target.value)} placeholder={(EXAMPLES[lang] ?? EXAMPLES.en)[0]} data-brain-prompt />
        <div className="sb-chips">
          {(EXAMPLES[lang] ?? EXAMPLES.en).map((x) => (
            <button key={x} type="button" className="sb-chip" onClick={() => setPrompt(x)}>
              {x}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary sb-make" disabled={!clips.length} onClick={make} data-brain-make>
          ✨ {t("make", lang)}
        </button>
        {done && (
          <p className="sb-done" role="status" data-brain-done>
            {done}
          </p>
        )}

        <section className="sb-card">
          <h3>🏆 {t("best", lang)}</h3>
          <p className="muted vj-small-text" data-brain-stats>
            {analysed}/{clips.length} analysed · 🎯 smart crop on {focused} · {clips.length - best.kept.length} near-duplicate{clips.length - best.kept.length === 1 ? "" : "s"}
          </p>
          <div className="sb-best">
            {best.kept.slice(0, 12).map((c, i) => (
              <img key={c.id} src={c.objectUrl} alt="" className={i < keepN ? "is-kept" : ""} style={c.brain?.fx != null ? { objectPosition: `${c.brain.fx * 100}% ${(c.brain.fy ?? 0.5) * 100}%` } : undefined} />
            ))}
          </div>
          <div className="sb-row">
            <input type="range" min={1} max={Math.max(1, best.kept.length)} value={keepN} onChange={(e) => setKeepN(+e.target.value)} aria-label="How many to keep" data-brain-keep-n />
            <button
              type="button"
              className="btn btn-ghost vj-small"
              data-brain-best
              disabled={clips.length < 2}
              onClick={() => {
                const ids = pickBest(clips, keepN).kept.map((c) => c.id);
                onKeep(ids);
                setDone(`🏆 Kept the best ${ids.length}`);
              }}
            >
              Keep best {keepN}
            </button>
          </div>
        </section>

        <section className="sb-card">
          <h3>🗺 {t("route", lang)}</h3>
          {route ? (
            <>
              <div className="sb-route">
                <RouteIntro route={route} accent={accent} loop />
              </div>
              <label className="toggle-row">
                <input type="checkbox" checked={!!settings?.routeIntro} onChange={(e) => onSettings({ ...settings, routeIntro: e.target.checked })} data-brain-route />
                <span>
                  {route.km.toLocaleString()} km · {route.points.length} stops{route.stops.length ? ` · ${route.stops.slice(0, 3).join(" → ")}` : ""}
                </span>
              </label>
            </>
          ) : (
            <p className="muted vj-small-text" data-brain-no-route>
              No GPS in these photos yet — phone camera photos usually have it.
            </p>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
}
