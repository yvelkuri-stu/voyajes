/**
 * Inspector for the selected timeline item (clip · transition · text · audio · project).
 * Compact in Minimalist mode: icons + one-line helper text.
 */
import type { CSSProperties, ReactNode } from "react";
import {
  ANIM_PRESETS,
  EASINGS,
  EMPHASIS_PRESETS,
  GRADE_PRESETS,
  TRANSITION_MAX_SEC,
  TRANSITION_MIN_SEC,
  gradeFilter,
  keyframesAt,
  type AnimPreset,
  type ClipAnimation,
  type Easing,
  type EmphasisPreset,
  type GradePreset,
  type Keyframe,
  type TransitionKind,
  type TransitionSpec,
} from "@voyajes/core";
import { transitionIcon, transitionLabel } from "../../data/themes";

const ANIM_ICON: Record<AnimPreset, string> = {
  none: "∅",
  fade: "◐",
  "slide-left": "⇠",
  "slide-right": "⇢",
  "slide-up": "⇡",
  "slide-down": "⇣",
  "zoom-in": "⊕",
  "zoom-out": "⊖",
  pop: "✸",
  spin: "↻",
  blur: "≋",
};
const EMPH_ICON: Record<EmphasisPreset, string> = {
  none: "∅",
  "ken-burns": "🔍",
  "ken-burns-out": "🔭",
  pulse: "💓",
  float: "🎈",
  shake: "📳",
  sway: "🌿",
};
const GRADE_LABEL: Record<GradePreset, string> = {
  none: "Natural",
  vivid: "Vivid",
  warm: "Warm",
  cool: "Cool",
  "teal-orange": "Teal & Orange",
  film: "Film",
  mono: "Mono",
  dreamy: "Dreamy",
  neon: "Neon",
};

function label(s: string) {
  return s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function Section({ title, hint, children, compact }: { title: string; hint?: string; children: ReactNode; compact?: boolean }) {
  return (
    <div className="vj-insp-section">
      <div className="vj-insp-section-head">
        <span>{title}</span>
        {hint && !compact && <span className="vj-insp-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function AnimationPicker({
  value,
  onChange,
  compact,
}: {
  value: ClipAnimation | undefined;
  onChange: (a: ClipAnimation) => void;
  compact?: boolean;
}) {
  const v = value ?? {};
  return (
    <>
      <Section title="In" hint="how it enters" compact={compact}>
        <div className="vj-insp-chips">
          {ANIM_PRESETS.map((a) => (
            <button key={a} type="button" className={`vj-chip${(v.in ?? "none") === a ? " active" : ""}`} onClick={() => onChange({ ...v, in: a })} title={label(a)}>
              <span aria-hidden>{ANIM_ICON[a]}</span>
              {!compact && <span>{label(a)}</span>}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Out" hint="how it leaves" compact={compact}>
        <div className="vj-insp-chips">
          {ANIM_PRESETS.map((a) => (
            <button key={a} type="button" className={`vj-chip${(v.out ?? "none") === a ? " active" : ""}`} onClick={() => onChange({ ...v, out: a })} title={label(a)}>
              <span aria-hidden>{ANIM_ICON[a]}</span>
              {!compact && <span>{label(a)}</span>}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Emphasis" hint="while on screen" compact={compact}>
        <div className="vj-insp-chips">
          {EMPHASIS_PRESETS.map((a) => (
            <button key={a} type="button" className={`vj-chip${(v.emphasis ?? "none") === a ? " active" : ""}`} onClick={() => onChange({ ...v, emphasis: a })} title={label(a)}>
              <span aria-hidden>{EMPH_ICON[a]}</span>
              {!compact && <span>{label(a)}</span>}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

const KF_FIELDS: { key: "x" | "y" | "scale" | "rotation" | "opacity"; label: string; min: number; max: number; step: number }[] = [
  { key: "x", label: "X", min: -0.5, max: 0.5, step: 0.01 },
  { key: "y", label: "Y", min: -0.5, max: 0.5, step: 0.01 },
  { key: "scale", label: "Scale", min: 0.3, max: 3, step: 0.01 },
  { key: "rotation", label: "Rotate", min: -180, max: 180, step: 1 },
  { key: "opacity", label: "Opacity", min: 0, max: 1, step: 0.01 },
];

export function KeyframeEditor({
  keys,
  localSec,
  onSet,
  onDelete,
  onSeekLocal,
  compact,
}: {
  keys: Keyframe[] | undefined;
  localSec: number;
  onSet: (props: Partial<Omit<Keyframe, "t">>) => void;
  onDelete: (t: number) => void;
  onSeekLocal: (t: number) => void;
  compact?: boolean;
}) {
  const now = keyframesAt(keys, localSec);
  const atKey = (keys ?? []).find((k) => Math.abs(k.t - localSec) <= 0.04);
  return (
    <Section title={`Keyframes ◆ ${localSec.toFixed(2)}s`} hint="move the playhead, then drag a slider" compact={compact}>
      <div className="vj-insp-kf-grid">
        {KF_FIELDS.map((f) => (
          <label key={f.key} className="vj-insp-row">
            <span>{f.label}</span>
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={now[f.key]}
              onChange={(e) => onSet({ [f.key]: Number(e.target.value) })}
            />
            <span className="vj-insp-val">{f.key === "rotation" ? `${Math.round(now[f.key])}°` : now[f.key].toFixed(2)}</span>
          </label>
        ))}
        <label className="vj-insp-row">
          <span>Ease</span>
          <select value={atKey?.easing ?? "ease-in-out"} onChange={(e) => onSet({ easing: e.target.value as Easing })}>
            {EASINGS.map((e) => (
              <option key={e} value={e}>{label(e)}</option>
            ))}
          </select>
        </label>
      </div>
      {(keys ?? []).length > 0 && (
        <div className="vj-insp-chips">
          {(keys ?? []).map((k) => (
            <span key={k.t} className={`vj-chip vj-kf-chip${atKey === k ? " active" : ""}`}>
              <button type="button" onClick={() => onSeekLocal(k.t)} title="Jump to keyframe">◆ {k.t.toFixed(2)}s</button>
              <button type="button" onClick={() => onDelete(k.t)} aria-label={`Delete keyframe at ${k.t.toFixed(2)}s`}>×</button>
            </span>
          ))}
        </div>
      )}
    </Section>
  );
}

export function TransitionBrowser({
  kinds,
  current,
  themeDefault,
  spec,
  onPick,
  onSpec,
  onRandom,
  onApplyAll,
  compact,
}: {
  kinds: TransitionKind[];
  /** null = theme default */
  current: TransitionKind | null;
  themeDefault: TransitionKind;
  spec: TransitionSpec | undefined;
  onPick: (k: TransitionKind | null) => void;
  onSpec: (s: TransitionSpec) => void;
  onRandom: () => void;
  onApplyAll: () => void;
  compact?: boolean;
}) {
  const sec = spec?.durationSec ?? 0.5;
  return (
    <>
      <div className="vj-tx-grid" role="listbox" aria-label="Transitions">
        <button type="button" className={`vj-tx-tile${current === null ? " active" : ""}`} onClick={() => onPick(null)} title={`Theme default · ${transitionLabel(themeDefault)}`}>
          <TxThumb kind={themeDefault} />
          <span className="vj-tx-name">Theme</span>
        </button>
        {kinds.map((k) => (
          <button key={k} type="button" className={`vj-tx-tile${current === k ? " active" : ""}`} onClick={() => onPick(k)} title={transitionLabel(k)}>
            <TxThumb kind={k} />
            <span className="vj-tx-name">
              <span aria-hidden>{transitionIcon(k)}</span> {transitionLabel(k)}
            </span>
          </button>
        ))}
        <button type="button" className="vj-tx-tile" onClick={onRandom} title="Random">
          <span className="vj-txthumb vj-txthumb-random">🎲</span>
          <span className="vj-tx-name">Random</span>
        </button>
      </div>
      <Section title="Duration" hint={`${TRANSITION_MIN_SEC}–${TRANSITION_MAX_SEC}s`} compact={compact}>
        <label className="vj-insp-row">
          <input
            type="range"
            min={TRANSITION_MIN_SEC}
            max={TRANSITION_MAX_SEC}
            step={0.1}
            value={sec}
            onChange={(e) => onSpec({ ...spec, durationSec: Number(e.target.value) })}
          />
          <span className="vj-insp-val">{sec.toFixed(1)}s</span>
        </label>
      </Section>
      <Section title="Easing" compact={compact}>
        <div className="vj-insp-chips">
          {EASINGS.map((e) => (
            <button key={e} type="button" className={`vj-chip${(spec?.easing ?? "ease-in-out") === e ? " active" : ""}`} onClick={() => onSpec({ ...spec, easing: e })}>
              {label(e)}
            </button>
          ))}
        </div>
      </Section>
      <button type="button" className="btn btn-ghost vj-insp-wide" onClick={onApplyAll}>
        ✦ Apply to all gaps
      </button>
    </>
  );
}

export function TxThumb({ kind, ms = 1100 }: { kind: TransitionKind; ms?: number }) {
  return (
    <span className="vj-txthumb" aria-hidden>
      <span className="vj-txthumb-a" />
      <span className={`vj-txthumb-b tx-${kind}`} style={{ "--tx-ms": `${ms}ms` } as CSSProperties} />
    </span>
  );
}

export function GradePicker({
  value,
  themeGrade,
  onChange,
  sampleUrl,
  compact,
}: {
  value: GradePreset | undefined;
  themeGrade: GradePreset;
  onChange: (g: GradePreset | undefined) => void;
  sampleUrl?: string;
  compact?: boolean;
}) {
  return (
    <Section title="Color grade" hint="LUT-style look" compact={compact}>
      <div className="vj-grade-grid">
        <button type="button" className={`vj-grade-tile${value === undefined ? " active" : ""}`} onClick={() => onChange(undefined)}>
          <span className="vj-grade-swatch" style={{ filter: gradeFilter(themeGrade), backgroundImage: sampleUrl ? `url(${sampleUrl})` : undefined }} />
          <span>Theme · {GRADE_LABEL[themeGrade]}</span>
        </button>
        {GRADE_PRESETS.map((g) => (
          <button key={g} type="button" className={`vj-grade-tile${value === g ? " active" : ""}`} onClick={() => onChange(g)}>
            <span className="vj-grade-swatch" style={{ filter: gradeFilter(g), backgroundImage: sampleUrl ? `url(${sampleUrl})` : undefined }} />
            <span>{GRADE_LABEL[g]}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

export { Section as InspectorSection, GRADE_LABEL };
