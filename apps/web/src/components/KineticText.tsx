import { isKinetic, wordStep, type TextTransition } from "@voyajes/core";

/**
 * v0.9 beat-synced kinetic captions for the live preview + guest player.
 * Timing comes from core `wordStep` — the same math the canvas export uses.
 * Mounting restarts the animation, so render it only while the overlay is active.
 */
export function KineticText({ text, kind, bpm, durationSec }: { text: string; kind: TextTransition; bpm?: number; durationSec?: number }) {
  if (!isKinetic(kind)) return <>{text}</>;
  const words = text.split(/\s+/).filter(Boolean);
  const step = wordStep(bpm, words.length, durationSec);
  return (
    <span className={`vj-kt vj-kt-${kind}`} data-kinetic={kind} style={{ ["--step" as string]: `${step}s` }}>
      {words.map((w, i) => (
        <span key={i} className="vj-kt-w" style={{ ["--i" as string]: i, ["--n" as string]: w.length }} data-word={w}>
          {w}
        </span>
      ))}
    </span>
  );
}
