import type { BeatSync } from "@voyajes/core";

/** Seconds per beat at a given BPM. */
export function beatIntervalSec(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0.5;
  return 60 / bpm;
}

/**
 * Snap a hold duration toward beat grid.
 * soft → nearest 1 beat, medium → nearest 2 beats, hard → nearest bar (4 beats).
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

export function describeBeatSync(mode: BeatSync, bpm: number): string {
  const beat = beatIntervalSec(bpm);
  if (mode === "off") return "Holds keep your manual lengths.";
  if (mode === "soft") {
    return `Snap to ~${beat.toFixed(2)}s beats (${bpm} BPM).`;
  }
  if (mode === "medium") {
    return `Snap to half-bars (~${(beat * 2).toFixed(2)}s).`;
  }
  return `Snap to bars (~${(beat * 4).toFixed(2)}s).`;
}
