// v0.9 kinetic, beat-synced caption styles. Pure + deterministic so the editor
// preview, browser export (canvas) and guest player all agree. The CLI renders
// these as plain text for now (documented fallback).
import type { TextTransition } from "./schema.js";

export const KINETIC_KINDS = ["word-pop", "karaoke", "word-bounce", "typewriter"] as const;
export type KineticKind = (typeof KINETIC_KINDS)[number];
export const isKinetic = (k: string | undefined | null): k is KineticKind =>
  !!k && (KINETIC_KINDS as readonly string[]).includes(k);

export type KineticWord = {
  word: string;
  /** 0..1 visibility */
  opacity: number;
  /** multiplicative scale */
  scale: number;
  /** vertical offset in em */
  dy: number;
  /** 0..1 highlight (karaoke fill / active word) */
  highlight: number;
  /** typewriter: number of visible chars of this word */
  chars: number;
};

/** Seconds per word: on the beat when bpm is known, clamped to stay readable. */
export function wordStep(bpm?: number | null, words = 1, durationSec?: number): number {
  let step = bpm && bpm > 30 ? 60 / bpm : 0.32;
  while (step < 0.18) step *= 2;
  while (step > 0.7) step /= 2;
  if (durationSec && words > 1) step = Math.min(step, (durationSec * 0.75) / words);
  return Math.max(0.06, step);
}

const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Per-word state at `t` seconds after the text appears.
 * `step` = seconds between words (see wordStep).
 */
export function kineticFrame(text: string, kind: TextTransition | KineticKind, t: number, step: number): KineticWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  return words.map((word, i) => {
    const local = t - i * step;
    const p = clamp01(local / Math.min(step, 0.28));
    const base: KineticWord = { word, opacity: 1, scale: 1, dy: 0, highlight: 0, chars: word.length };
    switch (kind) {
      case "word-pop":
        if (local < 0) return { ...base, opacity: 0, scale: 0.4 };
        return { ...base, opacity: clamp01(p * 2), scale: 0.4 + 0.6 * easeOutBack(p), highlight: local < step ? 1 - local / step : 0 };
      case "word-bounce": {
        if (local < 0) return { ...base, opacity: 0, dy: -0.6 };
        const b = local < 0.45 ? Math.abs(Math.cos(local * 10)) * Math.exp(-local * 7) : 0;
        return { ...base, opacity: clamp01(p * 3), dy: -0.6 * b, scale: 1 + 0.12 * b };
      }
      case "karaoke":
        // all words visible; the sung word fills, earlier words stay lit
        return { ...base, highlight: clamp01(local / step), scale: local >= 0 && local < step ? 1.08 : 1 };
      case "typewriter": {
        const perChar = step / Math.max(1, word.length + 1);
        const n = local < 0 ? 0 : Math.min(word.length, Math.floor(local / perChar) + 1);
        return { ...base, chars: n, opacity: n > 0 ? 1 : 0 };
      }
      default:
        return base;
    }
  });
}
