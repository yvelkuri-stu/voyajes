/**
 * Shared timeline → render helpers (preview, WebM, GIF, share playback).
 */
import {
  clampTransitionSec,
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

/** Theme layer — derived grade + default animation for each theme. */
export function themeLayer(theme: Pick<ThemeCard, "id" | "motion" | "photoMotion" | "tags">): {
  grade: GradePreset;
  animation: ClipAnimation;
} {
  const id = theme.id;
  const mood = (theme.tags ?? []).join(" ");
  let grade: GradePreset = "vivid";
  if (/noir|mono|classic/.test(id + mood)) grade = "mono";
  else if (/film|vintage|retro|nostalg/.test(id + mood)) grade = "film";
  else if (/sunset|golden|warm|desert|cozy|autumn/.test(id + mood)) grade = "warm";
  else if (/ocean|arctic|cool|ice|winter|blue/.test(id + mood)) grade = "cool";
  else if (/neon|night|party|club|cyber/.test(id + mood)) grade = "neon";
  else if (/dream|pastel|soft|wedding|love|bloom/.test(id + mood)) grade = "dreamy";
  else if (/cinema|epic|travel|road/.test(id + mood)) grade = "teal-orange";
  // Theme default animation = gentle motion on photos (applied to images only).
  const animation: ClipAnimation =
    theme.photoMotion === "off"
      ? {}
      : theme.photoMotion === "bold"
        ? { emphasis: "ken-burns" }
        : theme.motion === "snappy"
          ? { emphasis: "ken-burns-out" }
          : { emphasis: "ken-burns" };
  return { grade, animation };
}
