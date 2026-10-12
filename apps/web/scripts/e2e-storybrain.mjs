/**
 * v1.1 "Story Brain" e2e: GPS-tagged JPEGs → on-device analysis (EXIF GPS/time, smart crop, scores, duplicates)
 * → prompt-to-story in Telugu ("Fast reel of our trip to Goa, best 3") → route-map intro in the editor sheet,
 * the Status export (first frames are the map) and guest playback → shared GPS rounded to ~1 km
 * → time capsule seal/countdown/open → Year in Voyages recap + share card.
 *   BASE=https://yvelkuri-stu.github.io/voyajes API=https://voyajes-api.yeshu501.workers.dev node scripts/e2e-storybrain.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const BASE = (process.env.BASE || 'http://localhost:4310').replace(/\/$/, '');
const API = (process.env.API || 'https://voyajes-api.yeshu501.workers.dev').replace(/\/$/, '');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
const ok = (cond, label) => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); };
const until = async (fn, ms = 20000) => { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v || Date.now() - t > ms) return v; await new Promise((r) => setTimeout(r, 600)); } };

// ── EXIF builder (little-endian TIFF: DateTimeOriginal + GPS)
function exif(lat, lon, when) {
  const buf = Buffer.alloc(178);
  buf.write('II', 0); buf.writeUInt16LE(42, 2); buf.writeUInt32LE(8, 4);
  const ent = (o, tag, type, count, val) => { buf.writeUInt16LE(tag, o); buf.writeUInt16LE(type, o + 2); buf.writeUInt32LE(count, o + 4); buf.writeUInt32LE(val, o + 8); };
  buf.writeUInt16LE(2, 8); ent(10, 0x8769, 4, 1, 38); ent(22, 0x8825, 4, 1, 76); buf.writeUInt32LE(0, 34);
  buf.writeUInt16LE(1, 38); ent(40, 0x9003, 2, 20, 56); buf.writeUInt32LE(0, 52); buf.write(when + '\0', 56, 'ascii');
  buf.writeUInt16LE(4, 76);
  ent(78, 1, 2, 2, 0); buf.write(lat >= 0 ? 'N' : 'S', 86, 'ascii');
  ent(90, 2, 5, 3, 130); ent(102, 3, 2, 2, 0); buf.write(lon >= 0 ? 'E' : 'W', 110, 'ascii'); ent(114, 4, 5, 3, 154); buf.writeUInt32LE(0, 126);
  const rat = (o, v) => { v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60 * 100); [[d, 1], [m, 1], [s, 100]].forEach(([n, q], i) => { buf.writeUInt32LE(n, o + i * 8); buf.writeUInt32LE(q, o + i * 8 + 4); }); };
  rat(130, lat); rat(154, lon);
  const head = Buffer.alloc(10); head.writeUInt16BE(0xffe1, 0); head.writeUInt16BE(2 + 6 + buf.length, 2); head.write('Exif\0\0', 4, 'binary');
  return Buffer.concat([head, buf]);
}
const gen = await b.newPage();
const jpeg = async (seed) => Buffer.from(await gen.evaluate(async (seed) => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1200, 900); g.addColorStop(0, `hsl(${seed * 70},80%,55%)`); g.addColorStop(1, `hsl(${seed * 70 + 140},80%,35%)`);
  x.fillStyle = g; x.fillRect(0, 0, 1200, 900);
  // distinct scenery per photo (so only the real twin counts as a duplicate)
  for (let i = 0; i < 6; i++) { x.fillStyle = `hsl(${seed * 97 + i * 50},70%,${20 + ((seed * 13 + i * 29) % 60)}%)`; x.beginPath(); x.arc(((seed * 211 + i * 173) % 700), ((seed * 137 + i * 251) % 900), 60 + ((seed + i) % 4) * 50, 0, 7); x.fill(); }
  // a high-detail "subject" off to the right so smart crop has something to find
  for (let i = 0; i < 400; i++) { x.fillStyle = i % 2 ? '#fff' : '#111'; x.fillRect(820 + (i % 20) * 12, 250 + Math.floor(i / 20) * 12, 10, 10); }
  const bl = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); return btoa(String.fromCharCode(...new Uint8Array(await bl.arrayBuffer())));
}, seed), 'base64');
const withExif = (j, lat, lon, when) => Buffer.concat([j.subarray(0, 2), exif(lat, lon, when), j.subarray(2)]);
const imgA = await jpeg(1), imgB = await jpeg(2), imgC = await jpeg(3);
const files = [
  ['sb-1-mumbai.jpg', withExif(imgA, 19.076, 72.8777, '2026:03:01 09:00:00')],
  ['sb-2-pune.jpg', withExif(imgB, 18.5204, 73.8567, '2026:03:02 12:00:00')],
  ['sb-3-goa.jpg', withExif(imgC, 15.4909, 73.8278, '2026:03:04 18:00:00')],
  ['sb-4-goa-dup.jpg', withExif(imgC, 15.4912, 73.8281, '2026:03:04 18:00:05')],
].map(([n, buf]) => { const f = path.join(os.tmpdir(), n); fs.writeFileSync(f, buf); return f; });
await gen.close();

// ── host: import → Story Brain
const hctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const hp = await hctx.newPage();
const errs = []; hp.on('pageerror', (e) => errs.push(String(e)));
await hp.goto(BASE + '/create?fresh=1'); await hp.waitForTimeout(1800);
await hp.locator('input[type=file]').first().setInputFiles(files); await hp.waitForTimeout(2500);
await hp.locator('[data-open-story-brain]').click();
await hp.locator('[data-story-brain]').waitFor({ timeout: 10000 });
const stats = await until(async () => { const s = await hp.locator('[data-brain-stats]').innerText(); return /^4\/4 analysed/.test(s) && s; });
ok(!!stats, `on-device analysis: ${stats}`);
ok(/smart crop on 4/.test(stats || '') && /[1-9] near-duplicate/.test(stats || ''), 'smart crop focus on every photo + duplicate spotted');
ok(await hp.locator('[data-story-brain] [data-route-intro]').count() > 0, 'route-map preview from photo GPS');
const routeTxt = await hp.locator('[data-brain-route] + span').innerText().catch(() => '');
ok(/km · 3 stops/.test(routeTxt) && /Mumbai/.test(routeTxt) && /Goa/.test(routeTxt), `route: ${routeTxt}`);
await hp.locator('[data-brain-route]').check();
await hp.locator('[data-lang="te"]').click();
ok(/మీ కథ/.test(await hp.locator('label[for=sb-prompt]').innerText()), 'UI switches to Telugu');
await hp.locator('[data-brain-prompt]').fill('Fast reel of our trip to Goa, best 3');
await hp.locator('[data-brain-make]').click();
ok(/best 3/.test(await hp.locator('[data-brain-done]').innerText().catch(() => '')), `prompt → plan: ${await hp.locator('[data-brain-done]').innerText().catch(() => '')}`);
await hp.locator('.sb-x').click(); await hp.waitForTimeout(1500);
const draft = await hp.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/draft/i.test(k)) { try { const j = JSON.parse(localStorage.getItem(k)); if (j?.clips) return j; } catch {} } } return null; });
ok(draft?.clips?.length === 3, `best 3 kept (${draft?.clips?.length})`);
ok(/జ్ఞాపకాలు/.test(draft?.title || '') && /Goa/.test(draft?.title || ''), `Telugu title “${draft?.title}”`);
ok(/[\u0C00-\u0C7F]/.test(draft?.captionText || ''), `Telugu caption “${draft?.captionText}”`);
ok(draft?.storyBrain?.routeIntro === true && draft?.storyBrain?.lang === 'te', 'route intro + language saved with the project');
ok(draft?.clips?.every((c, i, a) => !i || (a[i - 1].brain?.takenAt || '') <= (c.brain?.takenAt || '')), 'story ordered by capture time');
ok(draft?.clips?.every((c) => c.durationSec <= 1.6), 'fast pace → short beats');
ok(draft?.clips?.every((c) => c.brain?.fx > 0.5), 'smart crop focus found the subject on the right');

// ── export: first frames are the route map (dark navy), later frames are photos
await hp.locator('[data-save-video]').first().click(); await hp.waitForTimeout(500);
const [dl] = await Promise.all([hp.waitForEvent('download', { timeout: 120000 }), hp.locator('[data-status-export]').first().click()]);
const vid = fs.readFileSync(await dl.path());
const px = await hp.evaluate(async (b64) => {
  const v = document.createElement('video'); v.muted = true; v.src = 'data:video/mp4;base64,' + b64;
  await new Promise((r) => (v.onloadeddata = r));
  const at = async (t) => { v.currentTime = t; await new Promise((r) => (v.onseeked = r)); const c = document.createElement('canvas'); c.width = 36; c.height = 64; const x = c.getContext('2d'); x.drawImage(v, 0, 0, 36, 64); const d = x.getImageData(0, 0, 36, 64).data; let r = 0, g = 0, bl = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; } const n = d.length / 4; return [r / n, g / n, bl / n]; };
  return { a: await at(1.0), b: await at(Math.max(3.5, v.duration - 0.3)), dur: v.duration };
}, vid.toString('base64'));
ok(px.a[2] > px.a[0] && px.a[0] < 70, `export opens on the route map (rgb ${px.a.map(Math.round)})`);
ok(Math.abs(px.b[0] - px.a[0]) + Math.abs(px.b[1] - px.a[1]) > 40, `then the photos (rgb ${px.b.map(Math.round)})`);
await hp.keyboard.press('Escape').catch(() => {});

// ── publish → guest playback with route intro
await hp.goto(BASE + '/create'); await hp.waitForTimeout(1500);
await hp.locator('button:has-text("Share")').first().click(); await hp.waitForURL(/\/v\//);
const pub = hp.locator('[data-publish]'); await pub.waitFor({ timeout: 20000 }); await hp.waitForTimeout(1200); await pub.click();
await hp.locator('[data-short-link]').waitFor({ timeout: 90000 });
const cloudId = (await hp.locator('[data-short-link]').innerText()).trim().split('/').pop();
ok(/^c[0-9A-Za-z]{7}$/.test(cloudId), `published ${cloudId}`);
const pack = (await (await fetch(`${API}/voyages/${cloudId}`)).json()).pack;
const br = pack?.share?.playback?.clips?.[0]?.brain;
ok(br && Math.abs(br.lat * 100 - Math.round(br.lat * 100)) < 1e-6 && Math.abs(br.lon * 100 - Math.round(br.lon * 100)) < 1e-6 && !br.hash, `shared GPS rounded to ~1 km (${br?.lat}, ${br?.lon}), no image hash`);
const gctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const gp = await gctx.newPage(); gp.on('pageerror', (e) => errs.push(String(e)));
await gp.goto(`${BASE}/v/${cloudId}`); await gp.waitForTimeout(3000);
await gp.locator('button:has-text("Play")').first().click().catch(() => {});
const ri = await until(async () => { const t = await gp.locator('[data-route-intro]').first().getAttribute('data-t'); return t && +t > 0.3 && t; }, 15000);
ok(!!ri, `guest playback opens with the route map (t=${ri})`);

// ── time capsule
await hp.locator('[data-capsule-host] summary').click().catch(() => {});
const future = new Date(Date.now() + 2 * 86400_000); const loc = new Date(future - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
await hp.locator('[data-capsule-date]').fill(loc);
await hp.locator('[data-capsule-seal]').click();
await hp.locator('[data-capsule-msg]').waitFor({ timeout: 15000 }).catch(() => {});
ok(/Sealed until/.test(await hp.locator('[data-capsule-msg]').innerText().catch(() => '')), 'host seals a time capsule');
const sealed = await (await fetch(`${API}/voyages/${cloudId}`)).json();
ok(sealed.locked === true && sealed.pack === null, 'API keeps the story sealed from guests');
await gp.goto(`${BASE}/v/${cloudId}`); await gp.locator('[data-capsule-locked]').waitFor({ timeout: 20000 }).catch(() => {});
const cd = await gp.locator('[data-capsule-countdown]').innerText().catch(() => '');
ok(/0?[12]\s*days/i.test(cd.replace(/\n/g, ' ')), `guest sees the countdown (${cd.replace(/\s+/g, ' ')})`);
await hp.reload(); await hp.locator('[data-capsule-open]').waitFor({ timeout: 20000 }).catch(() => {});
ok(await hp.locator('[data-short-link]').count() > 0, 'host can still open their sealed voyage');
await hp.locator('[data-capsule-open]').click(); await hp.waitForTimeout(1500);
await gp.goto(`${BASE}/v/${cloudId}`); await gp.waitForTimeout(3500);
ok(await gp.locator('[data-capsule-locked]').count() === 0, 'opened capsule plays again');

// ── Year in Voyages
await hp.goto(BASE + '/year'); await hp.locator('[data-year]').waitFor({ timeout: 15000 });
const n = +(await (await until(async () => (await hp.locator('[data-year-stories]').count()) ? hp.locator('[data-year-stories]') : (await hp.locator('[data-year]').click(), null), 12000))?.innerText().catch(() => '0') ?? 0);
ok(n >= 1, `year recap counts stories (${n})`);
for (let i = 0; i < 8 && !(await hp.locator('[data-year-share]').count()); i++) { await hp.locator('[data-year]').click(); await hp.waitForTimeout(400); }
const seen = await hp.locator('[data-year]').getAttribute('data-year-card');
ok(seen === 'share', 'recap ends on the share card');
const [ydl] = await Promise.all([hp.waitForEvent('download', { timeout: 20000 }), hp.locator('[data-year-share]').click()]);
const yp = fs.readFileSync(await ydl.path());
ok(yp.readUInt32BE(16) === 1080 && yp.readUInt32BE(20) === 1920, `year card PNG ${yp.readUInt32BE(16)}x${yp.readUInt32BE(20)}`);
ok(!errs.length, `no page errors ${errs.join(' | ')}`);

const secret = await hp.evaluate((id) => { try { return JSON.parse(localStorage.getItem('voyajes.hostVoyages.v1') || '[]').find((x) => x.id === id)?.secret ?? null; } catch { return null; } }, cloudId);
if (secret && !process.env.KEEP) await fetch(`${API}/voyages/${cloudId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}`, Origin: 'https://yvelkuri-stu.github.io' } });
console.log(`cleanup: ${secret ? 'deleted' : 'kept'} ${cloudId}`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
