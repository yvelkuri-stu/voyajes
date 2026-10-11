import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { breezePlan, breezeOrder, breezeCull, parseExif, nearestPlace, dateRangeLabel, hammingHex } from "../dist/index.js";

test("parseExif reads DateTimeOriginal + GPS", () => {
  const b = readFileSync(new URL("./exif.jpg", import.meta.url));
  const r = parseExif(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.equal(new Date(r.takenAt).toISOString(), "2026-10-03T14:22:01.000Z");
  assert.ok(Math.abs(r.lat - 15.5) < 1e-6 && Math.abs(r.lon - 73.9) < 1e-6);
  assert.equal(nearestPlace(r.lat, r.lon), "Goa");
});

test("order: EXIF time, else natural filename order", () => {
  const o = breezeOrder([
    { id: "a", name: "IMG_10.jpg", kind: "image", order: 0, takenAt: 3000 },
    { id: "b", name: "IMG_2.jpg", kind: "image", order: 1, takenAt: 1000 },
  ]);
  assert.deepEqual(o.map((x) => x.id), ["b", "a"]);
  const n = breezeOrder([
    { id: "a", name: "IMG_10.jpg", kind: "image", order: 0 },
    { id: "b", name: "IMG_2.jpg", kind: "image", order: 1 },
  ]);
  assert.deepEqual(n.map((x) => x.id), ["b", "a"]);
});

test("cull drops near-duplicates (keeps sharper) and blurry shots", () => {
  const items = [
    { id: "1", name: "1", kind: "image", order: 0, hash: "ffff0000ffff0000", sharpness: 100 },
    { id: "2", name: "2", kind: "image", order: 1, hash: "ffff0000ffff0001", sharpness: 150 },
    { id: "3", name: "3", kind: "image", order: 2, hash: "0000ffff0000ffff", sharpness: 120 },
    { id: "4", name: "4", kind: "image", order: 3, hash: "0f0f0f0f0f0f0f0f", sharpness: 130 },
    { id: "5", name: "5", kind: "image", order: 4, hash: "f0f0f0f0f0f0f0f0", sharpness: 140 },
    { id: "6", name: "6", kind: "image", order: 5, hash: "aaaaaaaaaaaaaaaa", sharpness: 110 },
    { id: "7", name: "7", kind: "image", order: 6, hash: "5555555555555555", sharpness: 3 },
  ];
  assert.equal(hammingHex("ffff0000ffff0000", "ffff0000ffff0001"), 1);
  const { kept, dropped } = breezeCull(items);
  assert.deepEqual(dropped.map((d) => d.id + ":" + d.reason).sort(), ["1:duplicate", "7:blurry"]);
  assert.equal(kept.length, 5);
});

test("plan: 15–30s, cuts land on beats, remix varies", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: "c" + i, name: `p${i}.jpg`, kind: "image", order: i, hash: (i * 0x1111).toString(16).padStart(16, "f").slice(-16).replace(/./g, (c, j) => ((parseInt(c, 16) + i * j) % 16).toString(16)), sharpness: 100 }));
  const p = breezePlan(items, { seed: 1, bpm: 120, themeTransition: "dissolve" });
  assert.ok(p.totalSec >= 14 && p.totalSec <= 31, `total ${p.totalSec}`);
  const beat = 0.5;
  let t = 0;
  for (let i = 0; i < p.clips.length - 1; i++) {
    const c = p.clips[i];
    t += c.durationSec - (c.transitionSpec?.durationSec ?? 0);
    assert.ok(Math.abs(t / beat - Math.round(t / beat)) < 1e-6, `cut ${i} at ${t}`);
  }
  const q = breezePlan(items, { seed: 2, bpm: 120, themeTransition: "dissolve" });
  assert.notEqual(JSON.stringify(p.clips.map((c) => c.transitionOut)), JSON.stringify(q.clips.map((c) => c.transitionOut)));
  assert.equal(dateRangeLabel([Date.UTC(2026, 9, 3), Date.UTC(2026, 9, 5)]), "Oct 3–5, 2026");
});
