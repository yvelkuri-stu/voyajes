import { test } from "node:test";
import assert from "node:assert/strict";
import { kineticFrame, wordStep, isKinetic, buildIcs, googleCalendarUrl, mapsUrl, fmtWhen, TextTransitionSchema } from "../dist/index.js";

test("kinetic kinds are valid text transitions", () => {
  for (const k of ["word-pop", "karaoke", "word-bounce", "typewriter"]) {
    assert.ok(isKinetic(k));
    assert.ok(TextTransitionSchema.safeParse(k).success);
  }
  assert.equal(isKinetic("fade"), false);
});
test("word-pop reveals words on the beat", () => {
  const step = wordStep(120, 3);
  assert.equal(step, 0.5);
  const f0 = kineticFrame("one two three", "word-pop", 0.01, step);
  assert.ok(f0[0].opacity > 0 && f0[1].opacity === 0 && f0[2].opacity === 0);
  const f1 = kineticFrame("one two three", "word-pop", 1.2, step);
  assert.ok(f1.every((w) => w.opacity > 0.99));
});
test("karaoke fills the sung word", () => {
  const f = kineticFrame("la la", "karaoke", 0.25, 0.5);
  assert.ok(f[0].highlight > 0.4 && f[0].highlight < 0.6);
  assert.equal(f[1].highlight, 0);
});
test("typewriter types per word", () => {
  const f = kineticFrame("hello", "typewriter", 0.2, 0.6);
  assert.ok(f[0].chars > 0 && f[0].chars < 5);
});
test("wordStep stays readable and fits the duration", () => {
  assert.ok(wordStep(200, 2) >= 0.18);
  assert.ok(wordStep(40, 2) <= 0.7);
  assert.ok(wordStep(60, 20, 3) <= 3 * 0.75 / 20 + 1e-9);
});
test(".ics + Google Calendar + maps", () => {
  const inv = { eventName: "Party", eventStart: "2030-01-02T18:00:00-08:00", eventWhere: "Pier 39", hostName: "Ana" };
  const ics = buildIcs({ uid: "cAbc1234", title: "Party", inv, url: "https://x.test/v/cAbc1234", now: 0 });
  assert.match(ics, /DTSTART:20300103T020000Z/);
  assert.match(ics, /DTEND:20300103T050000Z/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  const g = googleCalendarUrl({ title: "Party", inv });
  assert.match(g, /dates=20300103T020000Z%2F20300103T050000Z/);
  assert.equal(mapsUrl(inv), "https://www.google.com/maps/search/?api=1&query=Pier%2039");
  assert.equal(fmtWhen(inv), "Wed, Jan 2 · 6:00 PM");
  assert.equal(buildIcs({ uid: "x", title: "x", inv: { eventName: "x" }, url: "u" }), null);
});
