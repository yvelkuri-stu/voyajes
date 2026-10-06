import type { BeatSync } from "@voyajes/core";

/** Seconds per beat at a given BPM. */
export function beatIntervalSec(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0.5;
  return 60 / bpm;
}

/**
 * Snap a hold duration toward beat grid (mirrors web Create).
 * soft → 1 beat, medium → 2 beats, hard → bar (4 beats).
 */
export function snapDurationToBeat(
  durationSec: number,
  bpm: number,
  mode: BeatSync,
): number {
  if (mode === "off" || !Number.isFinite(durationSec)) return durationSec;
  const beat = beatIntervalSec(bpm);
  const unitBeats = mode === "soft" ? 1 : mode === "medium" ? 2 : 4;
  const unit = beat * unitBeats;
  const snapped = Math.max(unit, Math.round(durationSec / unit) * unit);
  return Math.min(30, Math.max(0.5, Math.round(snapped * 1000) / 1000));
}

export function defaultImageDuration(motion: string): number {
  if (motion === "cinematic" || motion === "float") return 3.2;
  if (motion === "snappy") return 2.2;
  return 2.8;
}
