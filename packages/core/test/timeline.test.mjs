import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../dist/index.js";
import {
  safeParseProject,
  parseProject,
  migrateProject,
  ease,
  keyframesAt,
  animationAt,
  layerTransformAt,
  upsertKeyframe,
  locateTime,
  clipStarts,
  gradeFilter,
  clampTransitionSec,
} from "../dist/index.js";

const v1 = {
  schema: 1,
  title: "Old draft",
  theme: "theme.ocean-pop@1.0.0",
  media: [{ path: "a.jpg" }, { path: "b.jpg" }],
  transitionEdges: [{ afterIndex: 0, kind: "whip" }],
};

test("v1 projects migrate to v2 and still parse", () => {
  const p = parseProject(v1);
  assert.equal(p.schema, 3);
  assert.equal(p.media[0].transitionOut, "whip");
  assert.equal(migrateProject({ ...v1, schema: 2 }).schema, 3);
});

test("v2 timeline fields validate", () => {
  const r = safeParseProject({
    ...v1,
    schema: 2,
    grade: "teal-orange",
    transitionSpec: { durationSec: 0.8, easing: "ease-out" },
    defaultAnimation: { emphasis: "ken-burns" },
    media: [
      {
        path: "a.mp4",
        inSec: 1.5,
        durationSec: 2,
        transitionOut: "spin",
        transitionSpec: { durationSec: 1.2, easing: "back-out" },
        animation: { in: "pop", out: "fade", emphasis: "pulse" },
        keyframes: [{ t: 0, scale: 1 }, { t: 1, scale: 1.4, rotation: 10 }],
      },
    ],
    text: [{ at: 0, role: "title", value: "Hi", keyframes: [{ t: 0.5, x: 0.1 }] }],
  });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
  const bad = safeParseProject({ ...v1, media: [{ path: "a", transitionSpec: { durationSec: 9 } }] });
  assert.equal(bad.success, false);
});

test("easing endpoints", () => {
  for (const e of ["linear", "ease-in", "ease-out", "ease-in-out", "back-out", "bounce"]) {
    assert.ok(Math.abs(ease(e, 0)) < 1e-9, e);
    assert.ok(Math.abs(ease(e, 1) - 1) < 1e-9, e);
  }
});

test("keyframes interpolate per property", () => {
  const keys = [
    { t: 0, scale: 1, x: 0, easing: "linear" },
    { t: 2, scale: 2, easing: "linear" },
    { t: 1, x: 0.4, easing: "linear" },
  ];
  const mid = keyframesAt(keys, 1);
  assert.ok(Math.abs(mid.scale - 1.5) < 1e-9);
  assert.ok(Math.abs(mid.x - 0.4) < 1e-9);
  assert.equal(keyframesAt(keys, 5).scale, 2);
  assert.equal(keyframesAt([], 1).scale, 1);
});

test("animation presets enter and exit", () => {
  const a = { in: "fade", out: "zoom-in" };
  assert.ok(animationAt(a, 0, 3).opacity < 0.01);
  assert.ok(Math.abs(animationAt(a, 1.5, 3).opacity - 1) < 1e-9);
  assert.ok(animationAt(a, 3, 3).opacity < 0.01);
  const kb = layerTransformAt({ emphasis: "ken-burns" }, [{ t: 0, rotation: 90 }], 3, 3);
  assert.ok(kb.scale > 1.1 && kb.rotation === 90);
});

test("upsertKeyframe merges near-equal times", () => {
  let k = upsertKeyframe(undefined, 1, { x: 0.1 });
  k = upsertKeyframe(k, 1.02, { scale: 2 });
  k = upsertKeyframe(k, 0.5, { opacity: 0.5 });
  assert.equal(k.length, 2);
  assert.equal(k[0].t, 0.5);
  assert.deepEqual({ x: k[1].x, scale: k[1].scale }, { x: 0.1, scale: 2 });
});

test("timeline locate + starts", () => {
  const clips = [{ durationSec: 2 }, { durationSec: 3 }, { durationSec: 1 }];
  assert.deepEqual(clipStarts(clips), [0, 2, 5]);
  assert.deepEqual(locateTime(clips, 2.5), { index: 1, local: 0.5 });
  assert.deepEqual(locateTime(clips, 99), { index: 2, local: 1 });
});

test("grades + clamps", () => {
  assert.equal(gradeFilter(undefined), "none");
  assert.match(gradeFilter("mono"), /grayscale/);
  assert.equal(clampTransitionSec(5), 2);
  assert.equal(clampTransitionSec(0.05), 0.2);
});

test("layoutTimeline overlaps like xfade and caps at half clip", () => {
  const L = T.layoutTimeline([{ durationSec: 2 }, { durationSec: 2 }, { durationSec: 1 }], (i) => (i === 0 ? 0.8 : 2));
  assert.deepEqual(L.starts.map((x) => +x.toFixed(3)), [0, 1.2, 2.7]);
  assert.equal(+L.total.toFixed(3), 3.7);
  const cut = T.layoutTimeline([{ durationSec: 2 }, { durationSec: 2 }], () => 0);
  assert.equal(cut.total, 4);
});

test("framesAt returns outgoing + incoming during overlap", () => {
  const clips = [{ durationSec: 2 }, { durationSec: 2 }];
  const L = T.layoutTimeline(clips, () => 1);
  const f = T.framesAt(L, clips, 1.5);
  assert.equal(f.index, 1);
  assert.equal(f.prev.index, 0);
  assert.ok(Math.abs(f.progress - 0.5) < 1e-9);
  assert.equal(T.framesAt(L, clips, 2.5).prev, undefined);
});

test("audioEnvelope applies volume, fades and ducking", () => {
  const env = T.audioEnvelope({ at: 0, durationSec: 10, volume: 0.8, fadeInSec: 1, fadeOutSec: 2 }, [[4, 6]], 0.25);
  assert.equal(T.envelopeAt(env, 0), 0);
  assert.ok(Math.abs(T.envelopeAt(env, 2) - 0.8) < 1e-6);
  assert.ok(Math.abs(T.envelopeAt(env, 5) - 0.2) < 1e-6);
  assert.ok(Math.abs(T.envelopeAt(env, 10)) < 1e-6);
});

test("speed + reverse helpers", () => {
  assert.equal(T.sourceTimeAt({ inSec: 1, speed: 2 }, 1.5), 4);
  assert.equal(T.clampSpeed(9), 4);
  assert.equal(T.motionTime({ durationSec: 3, reverse: true }, 1), 2);
});

test("piecewiseExpr builds nested ffmpeg if()", () => {
  const e = T.piecewiseExpr([{ t: 0, v: 1 }, { t: 1, v: 2 }]);
  assert.match(e, /^if\(lt\(t\\,1\)/);
});

test("migrate v2 → v3 and empty audio clips mean silence", () => {
  assert.equal(T.migrateProject({ schema: 2, media: [] }).schema, 3);
  assert.deepEqual(T.effectiveAudioClips({ track: "audio.x@1", clips: [] }, 5), []);
  assert.equal(T.effectiveAudioClips({ track: "audio.x@1" }, 5).length, 1);
});
