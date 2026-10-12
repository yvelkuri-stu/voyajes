import test from "node:test";
import assert from "node:assert/strict";
import { THEME_LOOKS, getLook, lookGradeCss, lookGradeFfmpeg, fxOps, rasterizeFx, lookRetime, lookCards } from "../dist/index.js";

test("at least 8 distinct looks with their own music, transitions and fx", () => {
  assert.ok(THEME_LOOKS.length >= 8);
  const music = new Set(THEME_LOOKS.map((l) => l.music.ref));
  assert.equal(music.size, THEME_LOOKS.length, "every theme has its own track");
  const sig = new Set(THEME_LOOKS.map((l) => JSON.stringify([l.grade, l.fx, l.particles.kind, l.transitions[0], l.text.style])));
  assert.equal(sig.size, THEME_LOOKS.length);
  for (const n of ["Neon Night", "Golden Hour", "Ocean Pop", "Soft Film", "Retro VHS", "Y2K Chrome", "Dreamy Pastel", "Monochrome Cinema"])
    assert.ok(THEME_LOOKS.some((l) => l.name === n), n);
});

test("intensity scales the grade (subtle → bold) for CSS and ffmpeg", () => {
  const l = getLook("theme.neon-night");
  assert.notEqual(lookGradeCss(l, 0), lookGradeCss(l, 1));
  assert.match(lookGradeCss(l, 1), /saturate\(/);
  assert.match(lookGradeFfmpeg(l, 1) ?? "", /eq=saturation=/);
  assert.match(lookGradeFfmpeg(getLook("theme.mono-cinema"), 0.7) ?? "", /hue=s=0/);
  assert.equal(getLook("nope").id, "theme.ocean-pop");
});

test("fx ops are deterministic and rasterise into screen/multiply/normal bands", () => {
  const l = getLook("theme.party-strobe");
  const a = fxOps(l, 0.7, 3.2, 180, 320), b = fxOps(l, 0.7, 3.2, 180, 320);
  assert.deepEqual(a, b);
  assert.ok(a.some((o) => o.t === "shape"), "confetti");
  const px = rasterizeFx(a, 180, 320);
  assert.equal(px.length, 180 * 320 * 3 * 4);
  let normalAlpha = 0;
  for (let i = 2 * 180 * 320; i < 3 * 180 * 320; i++) normalAlpha += px[i * 4 + 3];
  assert.ok(normalAlpha > 0, "something drawn in the normal band");
  const vhs = fxOps(getLook("theme.retro-vhs"), 1, 1, 180, 320);
  assert.ok(vhs.some((o) => o.t === "lines"));
  const cine = fxOps(getLook("theme.mono-cinema"), 1, 1, 180, 320);
  assert.ok(cine.filter((o) => o.t === "rect" && o.color === "#000000").length === 2, "letterbox");
});

test("retime puts cuts on the theme's beat and keeps 12–32s", () => {
  const clips = Array.from({ length: 7 }, (_, i) => ({ id: "c" + i, durationSec: 3 }));
  for (const l of THEME_LOOKS) {
    const r = lookRetime(clips, l);
    assert.equal(r.clips.length, 7);
    assert.ok(r.totalSec >= 12 && r.totalSec <= 34, `${l.name} ${r.totalSec}`);
    const beat = 60 / l.music.bpm;
    const startsDelta = r.clips[0].durationSec - l.transitionSec;
    assert.ok(Math.abs(startsDelta / beat - Math.round(startsDelta / beat)) < 0.01, `${l.name} on beat`);
    assert.equal(r.clips[0].transitionOut, l.transitions[0]);
    assert.equal(r.clips[6].transitionOut, undefined);
  }
  const fast = lookRetime(clips, getLook("theme.party-strobe")), slow = lookRetime(clips, getLook("theme.mono-cinema"));
  assert.notDeepEqual(fast.clips.map((c) => c.durationSec), slow.clips.map((c) => c.durationSec));
});

test("intro/outro cards", () => {
  const c = lookCards(getLook("theme.mono-cinema"), "Goa", 20);
  assert.deepEqual(c.map((x) => x.id), ["theme-title", "theme-intro", "theme-outro"]);
  assert.equal(c[2].value, "FIN.");
});
