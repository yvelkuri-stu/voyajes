import { useMemo, useRef, useState } from "react";
import type { ThemeCard } from "../data/themes";
import { getTemplates } from "../data/templates";
import { sampleCoverUrl } from "../data/samples";

/** v0.6 first-run: pick theme → drop photos → Breeze builds & plays the story. */
export function StoryWizard({
  themes,
  currentThemeId,
  onPickTheme,
  onFiles,
  onClose,
  busy,
}: {
  themes: ThemeCard[];
  currentThemeId: string;
  onPickTheme: (t: ThemeCard) => void;
  onFiles: (files: File[]) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const covers = useMemo(() => {
    const tpls = getTemplates();
    const out: Record<string, string | undefined> = {};
    for (const t of themes) {
      const tpl = tpls.find((x) => x.themeId === t.id && sampleCoverUrl(x.id));
      out[t.id] = tpl ? sampleCoverUrl(tpl.id) : undefined;
    }
    return out;
  }, [themes]);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => /^(image|video)\//.test(f.type) || /\.(jpe?g|png|webp|heic|gif|mp4|mov|webm)$/i.test(f.name));
    if (files.length) onFiles(files);
  };

  return (
    <div className="vj-wizard" role="dialog" aria-modal="true" aria-label="Make a story">
      <div className="vj-wizard-card">
        <button type="button" className="vj-wizard-x" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <p className="vj-wizard-kicker">Step {step} of 2</p>
        {step === 1 ? (
          <>
            <h2 className="vj-wizard-h">Pick a vibe</h2>
            <p className="muted vj-wizard-sub">Drop 5–10 photos next → a 15–30s cinematic story in under 2 minutes.</p>
            <div className="vj-wizard-themes">
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-wizard-theme={t.id}
                  className={`vj-wizard-theme${t.id === currentThemeId ? " is-on" : ""}`}
                  onClick={() => {
                    onPickTheme(t);
                    setStep(2);
                  }}
                >
                  <span className="vj-wizard-theme-img" style={{ background: t.gradient }}>
                    {covers[t.id] && <img src={covers[t.id]} alt="" loading="lazy" draggable={false} />}
                  </span>
                  <span className="vj-wizard-theme-name">{t.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="vj-wizard-h">Add your photos</h2>
            <p className="muted vj-wizard-sub">5–10 photos or short videos. We order them, skip blurry repeats, and cut to the beat.</p>
            <div
              className={`vj-wizard-drop${drag ? " is-drag" : ""}`}
              data-wizard-drop
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                take(e.dataTransfer.files);
              }}
              onClick={() => input.current?.click()}
              role="button"
              tabIndex={0}
            >
              {busy ? (
                <span className="vj-wizard-busy">✨ Making your story…</span>
              ) : (
                <>
                  <span className="vj-wizard-drop-icon" aria-hidden>＋</span>
                  <span className="vj-wizard-drop-big">Choose photos</span>
                  <span className="muted">or drop them here</span>
                </>
              )}
              <input
                ref={input}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                data-wizard-input
                onChange={(e) => {
                  take(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            <button type="button" className="btn btn-ghost vj-wizard-back" onClick={() => setStep(1)}>
              ← Change vibe
            </button>
          </>
        )}
      </div>
    </div>
  );
}
