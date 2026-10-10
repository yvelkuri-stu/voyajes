/**
 * Shared timeline → render helpers (preview, WebM, GIF, share playback).
 */
import {
  clampTransitionSec,
  themeLayerFor,
  layoutTimeline,
  requestedTransitionSec,
  type TimelineLayout,
  type TransitionKind,
  type ClipAnimation,
  type Easing,
  type GradePreset,
  type Keyframe,
  type TransitionSpec,
} from "@voyajes/core";
import type { ThemeCard } from "../data/themes";

export type TimelineClipFields = {
  durationSec: number;
  inSec?: number;
  transitionSpec?: TransitionSpec;
  animation?: ClipAnimation;
  keyframes?: Keyframe[];
};

/** Duration (s) of the transition entering clip `toIndex`. */
export function transitionSecInto(
  clips: Pick<TimelineClipFields, "transitionSpec" | "durationSec">[],
  toIndex: number,
  project: TransitionSpec | undefined,
  theme: Pick<ThemeCard, "transitionDurationMs">,
): number {
  const spec = toIndex > 0 ? clips[toIndex - 1]?.transitionSpec : undefined;
  const raw =
    spec?.durationSec ?? project?.durationSec ?? Math.max(0.08, theme.transitionDurationMs / 1000);
  const into = clips[toIndex];
  const capped = into ? Math.min(raw, Math.max(0.08, into.durationSec * 0.8)) : raw;
  return spec?.durationSec || project?.durationSec ? Math.min(clampTransitionSec(raw), capped) : capped;
}

export function transitionEasingInto(
  clips: Pick<TimelineClipFields, "transitionSpec">[],
  toIndex: number,
  project: TransitionSpec | undefined,
): Easing | undefined {
  const spec = toIndex > 0 ? clips[toIndex - 1]?.transitionSpec : undefined;
  return spec?.easing ?? project?.easing;
}

/** Theme layer — derived grade + default animation (shared with CLI via core). */
export function themeLayer(theme: Pick<ThemeCard, "id" | "motion" | "photoMotion" | "tags">): {
  grade: GradePreset;
  animation: ClipAnimation;
} {
  return themeLayerFor(theme);
}

/** Overlapping layout (xfade semantics) shared with the CLI. */
export function computeLayout(
  clips: { durationSec: number; transitionOut?: TransitionKind | null; transitionSpec?: TransitionSpec }[],
  globalKind: TransitionKind,
  projectSpec: TransitionSpec | undefined,
  theme: Pick<ThemeCard, "transitionDurationMs">,
): TimelineLayout {
  return layoutTimeline(clips, (gi) =>
    requestedTransitionSec(
      clips[gi].transitionOut ?? globalKind,
      clips[gi].transitionSpec,
      projectSpec,
      theme.transitionDurationMs,
    ),
  );
}
