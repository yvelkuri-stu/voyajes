/**
 * v1.0 "After-Movie" e2e: invitation → publish → host sees After-Movie panel (party camera + TV)
 * → guest scans the party-camera card (?drop=1) → live camera (fake webcam shutter + camera roll)
 * → TV mode live slideshow picks up new drops + QR → crowd votes → notify me (push or in-app)
 * → host shares the after-movie → guest gets the in-app notice and watches the voted cut
 * → share-back link → host renders + attaches the film (WebCodecs fast export).
 *   BASE=https://yvelkuri-stu.github.io/voyajes API=https://voyajes-api.yeshu501.workers.dev node scripts/e2e-aftermovie.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';

const BASE = (process.env.BASE || 'http://localhost:4310').replace(/\/$/, '');
const API = (process.env.API || 'https://voyajes-api.yeshu501.workers.dev').replace(/\/$/, '');
const png = (name, rgb) => { const w = 320, h = 320; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const s = ((x >> 5) + (y >> 5)) % 2 ? 1 : 0.5; raw[o] = rgb[0] * s; raw[o + 1] = rgb[1] * s; raw[o + 2] = rgb[2] * s; }
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); const crc = (b) => { let c = ~0; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 2;
  const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', hd), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))])); return f; };
const A = png('vja-a.png', [240, 60, 120]), B = png('vja-b.png', [40, 160, 240]), C = png('vja-c.png', [250, 200, 40]), D = png('vja-d.png', [60, 220, 120]);

const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
let fails = 0;
const ok = (cond, label) => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); };
const live = async (id, dev = '') => (await fetch(`${API}/voyages/${id}/live${dev ? `?deviceId=${dev}` : ''}`)).json();
const until = async (fn, ms = 20000) => { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v || Date.now() - t > ms) return v; await new Promise((r) => setTimeout(r, 700)); } };
const setVal = (p, sel, v) => p.evaluate(([sel, v]) => {
  const el = document.querySelector(sel); if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true;
}, [sel, v]);

// ── host: invitation → publish
const hctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const hp = await hctx.newPage();
const herrs = []; hp.on('pageerror', (e) => herrs.push(String(e)));
await hp.goto(BASE + '/create?mode=invitation&fresh=1'); await hp.waitForTimeout(1800);
await hp.locator('input[type=file]').first().setInputFiles([A]); await hp.waitForTimeout(1200);
const year = new Date().getFullYear() + 1;
await setVal(hp, 'input[aria-label="Event name"]', 'After-Movie Party');
await setVal(hp, '[data-event-start]', `${year}-08-01T19:00`);
await hp.waitForTimeout(1000);
await hp.locator('button:has-text("Share")').first().click();
await hp.waitForURL(/\/v\//);
const pub = hp.locator('[data-publish]'); await pub.waitFor({ timeout: 20000 }); await hp.waitForTimeout(1200); await pub.click();
await hp.locator('[data-short-link]').waitFor({ timeout: 90000 });
const shortUrl = (await hp.locator('[data-short-link]').innerText()).trim();
const cloudId = shortUrl.split('/').pop();
ok(/^c[0-9A-Za-z]{7}$/.test(cloudId), `published ${shortUrl}`);
// guests use the short link on live; a local build can't be reached through it
const guestUrl = /github\.io/.test(BASE) ? shortUrl : `${BASE}/v/${cloudId}`;
await hp.locator('[data-manage-tab="after"]').click({ timeout: 20000 }).catch(() => {}); await hp.locator('[data-aftermovie-host]').waitFor({ timeout: 20000 }).catch(() => {});
ok(await hp.locator('[data-aftermovie-host]').count() > 0, 'host Manage has the After-Movie panel');
ok(!!(await until(async () => /automatically after/i.test(await hp.locator('[data-aftermovie-host]').innerText()), 15000)), 'host told guests get it automatically after the event');
const tvHref = await hp.locator('[data-tv-link]').getAttribute('href').catch(() => null);
ok(!!tvHref && tvHref.endsWith(`/tv/${cloudId}`), `TV mode link ${tvHref}`);
ok(/Party camera card/.test(await hp.locator('[data-qr-card="table-pdf"]').innerText().catch(() => '')), 'QR panel offers the party camera card');

// ── TV on the big screen (before anyone shoots)
const tctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const tv = await tctx.newPage();
const terrs = []; tv.on('pageerror', (e) => terrs.push(String(e)));
await tv.goto(`${BASE}/tv/${cloudId}`); await tv.locator('[data-tv-mode]').waitFor({ timeout: 20000 });
const qr = await tv.locator('[data-qr]').getAttribute('data-qr').catch(() => '');
ok((qr || '').endsWith(`/live/${cloudId}`), `TV shows a join QR → ${qr}`);

// ── guest A scans the party-camera card
const gctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
const ga = await gctx.newPage();
const gerrs = []; ga.on('pageerror', (e) => gerrs.push(String(e)));
await ga.goto(`${guestUrl}?drop=1`);
await ga.waitForURL(/\/live\/c/, { timeout: 30000 }).catch(() => {});
ok(/\/live\//.test(ga.url()), `party-camera QR opens the live camera (${ga.url().replace(BASE, '')})`);
await ga.locator('[data-party-camera]').waitFor({ timeout: 20000 });
await ga.locator('[data-live-name]').fill('Zoe');
await ga.locator('[data-start-camera]').click();
await ga.waitForFunction(() => (document.querySelector('[data-party-camera] video')?.videoWidth ?? 0) > 0, null, { timeout: 15000 }).catch(() => {});
await ga.locator('[data-shutter]').click();
const shot = await until(async () => (await live(cloudId)).drops.length >= 1);
ok(!!shot, 'shutter (fake webcam) → photo lands on the live wall');
ok(/big screen/.test(await ga.locator('[data-live-sent]').innerText().catch(() => '')), 'guest sees "On the big screen"');
await ga.locator('[data-live-file]').setInputFiles(B);
await until(async () => (await live(cloudId)).drops.length >= 2);

// TV picks it up live
const tvCount = await until(async () => /^[2-9]/.test(await tv.locator('[data-tv-count]').innerText()), 15000);
ok(!!tvCount, `TV mode live count → ${await tv.locator('[data-tv-count]').innerText().catch(() => '?')}`);
ok(await tv.locator('[data-tv-slide]').count() > 0, 'TV mode shows a slide with the guest credit');

// ── guest B: drop + vote + notify me
const g2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const gb = await g2.newPage();
// the in-app inbox polls every 45s: record every notice it raises (survives reloads) so the
// check below doesn't race the poll that may fire between the host's release and our reload
await gb.addInitScript(() => window.addEventListener('voyajes:notice', (e) => { try { const k = 'vj-e2e-notices'; const l = JSON.parse(sessionStorage.getItem(k) || '[]'); l.push(e.detail?.notice?.kind + '|' + e.detail?.notice?.title); sessionStorage.setItem(k, JSON.stringify(l)); } catch {} }));
gb.on('pageerror', (e) => gerrs.push(String(e)));
await gb.goto(`${BASE}/live/${cloudId}`); await gb.locator('[data-party-camera]').waitFor({ timeout: 20000 });
await gb.locator('[data-live-name]').fill('Ravi');
await gb.locator('[data-live-file]').setInputFiles(C); await until(async () => (await live(cloudId)).drops.length >= 3);
await gb.locator('[data-live-file]').setInputFiles(D);
const w3 = await until(async () => { const w = await live(cloudId); return w.drops.length >= 4 && w; });
const fresh = await until(async () => (await tv.locator('.am-tv-new').count()) > 0 || /^4/.test(await tv.locator('[data-tv-count]').innerText()), 15000);
ok(!!fresh, 'TV jumps to the newest drop');
const fav = w3.drops.find((d) => d.name === 'Zoe') || w3.drops[w3.drops.length - 1];
await gb.reload(); await gb.locator('[data-vote-strip]').waitFor({ timeout: 20000 });
await gb.locator(`[data-vote="${fav.id}"]`).click(); await gb.waitForTimeout(1200);
await ga.reload(); await ga.locator(`[data-vote="${fav.id}"]`).waitFor({ timeout: 20000 });
await ga.locator(`[data-vote="${fav.id}"]`).click(); await gb.waitForTimeout(1200);
const voted = (await live(cloudId)).drops.find((d) => d.id === fav.id);
ok(voted?.votes === 2, `crowd votes counted (${voted?.votes})`);
ok(/2/.test(await ga.locator(`[data-vote="${fav.id}"] .am-vote-badge`).innerText().catch(() => '')) && (await ga.locator(`[data-vote="${fav.id}"]`).getAttribute('aria-pressed')) === 'true', 'vote shows as mine with the count');
await gb.goto(guestUrl); await gb.locator('[data-aftermovie="live"]').waitFor({ timeout: 25000 }).catch(() => {});
ok(await gb.locator('[data-open-party-camera]').count() > 0, 'guest invite page has "Open party camera"');
await gb.locator('[data-notify-me]').click();
await gb.locator('[data-notify-on]').waitFor({ timeout: 15000 }).catch(() => {});
const how = await gb.locator('[data-notify-on]').getAttribute('data-notify-on').catch(() => null);
ok(how === 'push' || how === 'in-app', `notify me → ${how}`);

// ── host shares the after-movie
await hp.reload(); await hp.locator('[data-manage-tab="after"]').click({ timeout: 20000 }).catch(() => {}); await hp.locator('[data-release-aftermovie]').waitFor({ timeout: 25000 });
await hp.waitForFunction(() => !document.querySelector('[data-release-aftermovie]')?.disabled, null, { timeout: 20000 }).catch(() => {});
await hp.locator('[data-release-aftermovie]').click();
await hp.locator('[data-aftermovie-msg]').waitFor({ timeout: 20000 }).catch(() => {});
ok(/shared with guests/i.test(await hp.locator('[data-aftermovie-msg]').innerText().catch(() => '')), 'host: "After-movie shared with guests"');
const notices = await (await fetch(`${API}/voyages/${cloudId}/notices`)).json();
ok(notices.notices?.[0]?.kind === 'aftermovie', 'notice recorded for push + in-app delivery');

// guest B: in-app notification fallback + the voted cut
await gb.reload();
const toast = await until(async () => /after-movie is ready/i.test(await gb.locator('[data-inbox-toast], .notif-toast').first().innerText({ timeout: 1000 }))
  || (await gb.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); return sessionStorage.getItem('vj-e2e-notices') || ''; })).includes('aftermovie|'), 30000);
ok(!!toast, 'guest gets the in-app "after-movie is ready" notification');
await gb.locator('[data-aftermovie="ready"]').waitFor({ timeout: 25000 }).catch(() => {});
ok(await gb.locator('[data-aftermovie-player]').count() > 0, 'guest sees the After-Movie player');
const heroes = (await gb.locator('[data-aftermovie="ready"]').getAttribute('data-cut-heroes').catch(() => '')) || '';
ok(heroes.split(',').includes(fav.id), 'most-voted moment is a hero shot in the cut');
ok(await gb.locator('[data-aftermovie-share]').count() > 0, 'one-tap "Share the after-movie"');
await gb.goto(`${guestUrl}?aftermovie=1`); await gb.locator('[data-aftermovie="ready"]').waitFor({ timeout: 25000 }).catch(() => {});
await gb.waitForTimeout(2500);
const inView = await gb.evaluate(() => { const r = document.querySelector('[data-aftermovie="ready"]')?.getBoundingClientRect(); return !!r && r.top < innerHeight && r.bottom > 0; });
ok(inView, 'shared-back link (?aftermovie=1) lands on the after-movie');
await ga.reload(); await ga.locator('[data-aftermovie-banner]').waitFor({ timeout: 15000 }).catch(() => {});
ok(await ga.locator('[data-aftermovie-banner]').count() > 0, 'party camera shows "the after-movie is out"');

// ── host renders the film (WebCodecs fast export where available)
const wc = await hp.evaluate(() => typeof VideoEncoder !== 'undefined');
await hp.locator('[data-aftermovie-host] details summary').click();
await hp.locator('[data-aftermovie-render]').click();
await hp.waitForFunction(() => /attached|fail|error/i.test(document.querySelector('[data-aftermovie-msg]')?.textContent || ''), null, { timeout: 180000 }).catch(() => {});
const rmsg = await hp.locator('[data-aftermovie-msg]').innerText().catch(() => '');
ok(/attached/.test(rmsg), `after-movie video attached: ${rmsg}`);
if (wc) ok(/WebCodecs/.test(rmsg), 'used WebCodecs fast export');
const secs = /· ([\d.]+)s for (\d+)s/.exec(rmsg);
if (secs) ok(+secs[1] < +secs[2], `faster than real time (${secs[1]}s for ${secs[2]}s)`);
const w4 = await live(cloudId);
const vid = w4.aftermovieUrl ? Buffer.from(await (await fetch(w4.aftermovieUrl)).arrayBuffer()) : Buffer.alloc(0);
ok(vid.length > 10000 && (vid.subarray(4, 8).toString() === 'ftyp' || vid[0] === 0x1a), `after-movie file served (${vid.length} B, ${vid.subarray(4, 8).toString()})`);
await gb.reload(); await gb.locator('[data-aftermovie-video]').waitFor({ timeout: 20000 }).catch(() => {});
ok(await gb.locator('[data-aftermovie-video]').count() > 0, 'guests now get the rendered film');

ok(!herrs.length && !gerrs.length && !terrs.length, `no page errors ${[...herrs, ...gerrs, ...terrs].join(' | ')}`);

const secret = await hp.evaluate((id) => { try { return JSON.parse(localStorage.getItem('voyajes.hostVoyages.v1') || '[]').find((x) => x.id === id)?.secret ?? null; } catch { return null; } }, cloudId);
if (secret && !process.env.KEEP) await fetch(`${API}/voyages/${cloudId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}`, Origin: 'https://yvelkuri-stu.github.io' } });
console.log(`cleanup: ${secret && !process.env.KEEP ? 'deleted' : 'kept'} ${cloudId}`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
