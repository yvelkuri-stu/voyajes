import { test } from "node:test";
import assert from "node:assert/strict";
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
  assert.equal(p.schema, 2);
  assert.equal(p.media[0].transitionOut, "whip");
  assert.equal(migrateProject({ ...v1, schema: 2 }).schema, 2);
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
