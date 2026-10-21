/**
 * v0.9 "One Link" e2e: invitation with event details → publish → WhatsApp-UA OG preview +
 * themed cover + human redirect → .ics → QR cards (PDF + decodable PNG) → Status export →
 * host update → guest RSVP +1 / calendar / maps → report comment → host hides it → /terms.
 *   BASE=https://yvelkuri-stu.github.io/voyajes API=https://voyajes-api.yeshu501.workers.dev node scripts/e2e-onelink.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';
import jsQR from 'jsqr';

const BASE = (process.env.BASE || 'http://localhost:4310').replace(/\/$/, '');
const API = (process.env.API || 'https://voyajes-api.yeshu501.workers.dev').replace(/\/$/, '');
const WA = 'WhatsApp/2.24.1.1 A';
const png = (name, rgb) => { const w = 320, h = 320; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const s = ((x >> 5) + (y >> 5)) % 2 ? 1 : 0.5; raw[o] = rgb[0] * s; raw[o + 1] = rgb[1] * s; raw[o + 2] = rgb[2] * s; }
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); const crc = (b) => { let c = ~0; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 2;
  const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', hd), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))])); return f; };
const A = png('vjo-a.png', [240, 60, 120]), B = png('vjo-b.png', [40, 160, 240]);

const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
const ok = (cond, label) => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); };
const setVal = (p, sel, v) => p.evaluate(([sel, v]) => {
  const el = document.querySelector(sel); if (!el) return false;
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}, [sel, v]);

// ── host builds an invitation with real event details
const hctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const hp = await hctx.newPage();
const herrs = []; hp.on('pageerror', (e) => herrs.push(String(e)));
await hp.goto(BASE + '/create?mode=invitation&fresh=1'); await hp.waitForTimeout(1800);
await hp.locator('input[type=file]').first().setInputFiles([A, B]); await hp.waitForTimeout(1500);
const year = new Date().getFullYear() + 1;
await setVal(hp, 'input[aria-label="Event name"]', 'One Link Party');
await setVal(hp, 'input[aria-label="Event where"]', 'Golden Gate Park');
ok(await setVal(hp, '[data-event-start]', `${year}-06-20T18:30`), 'event start field present');
await setVal(hp, '[data-event-address]', '501 Stanyan St, San Francisco');
await setVal(hp, '[data-rsvp-deadline]', `${year}-06-15T23:00`);
await setVal(hp, '[data-plus-ones-max]', '2');
await hp.waitForTimeout(1200);

// Status export preset (9:16, ≤30s, ≤16MB) — headless has no share sheet → download
await hp.locator('[data-save-video]').first().click().catch(() => {});
await hp.waitForTimeout(500);
const st = hp.locator('[data-status-export]').first();
ok(await st.count() > 0, 'Save sheet has "Share to WhatsApp Status"');
ok(await hp.locator('[data-no-watermark-save]').count() > 0, 'Save sheet states "no watermark"');
const [dl] = await Promise.all([hp.waitForEvent('download', { timeout: 120000 }), st.click()]);
const stPath = await dl.path(); const stSize = fs.statSync(stPath).size;
const dims = await hp.evaluate(async (u) => new Promise((res) => { const v = document.createElement('video'); v.muted = true; v.onloadedmetadata = () => res([v.videoWidth, v.videoHeight, v.duration]); v.onerror = () => res([0, 0, 0]); v.src = u; }), 'data:video/mp4;base64,' + fs.readFileSync(stPath).toString('base64'));
ok(stSize > 10_000 && stSize < 16 * 1024 * 1024 && /status\.(mp4|webm)$/.test(dl.suggestedFilename()), `Status export ${dl.suggestedFilename()} ${(stSize / 1e6).toFixed(2)} MB`);
ok(dims[1] > dims[0] || dims[0] === 0, `Status export is portrait (${dims[0]}x${dims[1]})`);
await hp.keyboard.press('Escape').catch(() => {});

await hp.goto(BASE + '/create'); await hp.waitForTimeout(1500);
await hp.locator('button:has-text("Share")').first().click();
await hp.waitForURL(/\/v\//);
const pub = hp.locator('[data-publish]'); await pub.waitFor({ timeout: 20000 });
await hp.waitForTimeout(1500); await pub.click();
await hp.locator('[data-short-link]').waitFor({ timeout: 90000 }).catch(async (e) => { console.log('publish status:', (await hp.evaluate(() => document.body.innerText)).match(/.*(publish|Short link|link).*/gi)?.slice(0, 8)); throw e; });
await hp.waitForFunction(() => !document.querySelector('[data-publish]')?.disabled, null, { timeout: 60000 });
const shortUrl = (await hp.locator('[data-short-link]').innerText()).trim();
const cloudId = shortUrl.split('/').pop();
ok(shortUrl.startsWith(API + '/v/') || shortUrl.includes('/v/c'), `short link ${shortUrl}`);
ok(await hp.locator('[data-one-tap-share]').count() > 0, 'one-tap Share link button');

// ── link preview as WhatsApp
const og = await (await fetch(`${API}/v/${cloudId}`, { headers: { 'User-Agent': WA } })).text();
const meta = (p) => (new RegExp(`property="${p}" content="([^"]*)"`).exec(og) || [])[1];
ok(meta('og:title') === 'One Link Party', `OG title "${meta('og:title')}"`);
ok(/Jun 20/.test(meta('og:description') || '') && /Golden Gate Park/.test(meta('og:description') || ''), `OG description "${meta('og:description')}"`);
const img = await fetch(meta('og:image'), { headers: { 'User-Agent': WA } });
const imgBuf = Buffer.from(await img.arrayBuffer()); fs.writeFileSync(path.join(os.tmpdir(), 'vj-og-cover.jpg'), imgBuf);
ok(img.headers.get('content-type') === 'image/jpeg' && imgBuf.length > 15000 && imgBuf[0] === 0xff, `og:image themed cover JPG (${imgBuf.length} B)`);
const human = await fetch(`${API}/v/${cloudId}`, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1' } });
ok(human.status === 302 && /\/v\/c/.test(human.headers.get('location') || ''), `humans → ${human.status} ${human.headers.get('location')}`);

// ── calendar
const ics = await (await fetch(`${API}/voyages/${cloudId}/event.ics`)).text();
ok(/BEGIN:VEVENT/.test(ics) && /SUMMARY:One Link Party/.test(ics) && /DTSTART:\d{8}T\d{6}Z/.test(ics) && /LOCATION:Golden Gate Park/.test(ics), '.ics has event, start and location');

// ── QR cards from Manage
await hp.locator('[data-manage-tab="share"]').click({ timeout: 20000 }).catch(() => {}); await hp.locator('[data-qr-cards]').waitFor({ timeout: 20000 });
const [pdfDl] = await Promise.all([hp.waitForEvent('download'), hp.locator('[data-qr-card="a6-pdf"]').click()]);
const pdf = fs.readFileSync(await pdfDl.path());
ok(pdf.subarray(0, 5).toString() === '%PDF-' && /MediaBox \[0 0 297.64 419.53\]/.test(pdf.toString('latin1')) && /%%EOF/.test(pdf.toString('latin1')), `A6 PDF card (${pdf.length} B)`);
const [pngDl] = await Promise.all([hp.waitForEvent('download'), hp.locator('[data-qr-card="phone-png"]').click()]);
const pngB64 = fs.readFileSync(await pngDl.path()).toString('base64'); fs.writeFileSync(path.join(os.tmpdir(), 'vj-phone-card.png'), Buffer.from(pngB64, 'base64'));
const px = await hp.evaluate(async (b64) => {
  const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data; return { w: c.width, h: c.height, data: Array.from(d) };
}, pngB64);
const code = jsQR(Uint8ClampedArray.from(px.data), px.w, px.h);
ok(px.w === 1080 && px.h === 1920 && code?.data === shortUrl, `phone QR card decodes to ${code?.data}`);
const [tDl] = await Promise.all([hp.waitForEvent('download'), hp.locator('[data-qr-card="table-pdf"]').click()]);
ok(/table\.pdf$/.test(tDl.suggestedFilename()), 'table card (photo drop) PDF');

// ── host update broadcast
await hp.locator('[data-manage-tab="guests"]').click({ timeout: 20000 }).catch(() => {}); await hp.locator('[data-host-update-input]').fill('Bring a jacket 🧥');
await hp.locator('[data-host-update-form] button[type=submit]').click(); await hp.waitForTimeout(1500);

// ── guest
const gctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
const gp = await gctx.newPage();
const gerrs = []; gp.on('pageerror', (e) => gerrs.push(String(e)));
await gp.goto(shortUrl); await gp.waitForTimeout(5000);
ok(/Bring a jacket/.test(await gp.locator('[data-host-updates]').innerText().catch(() => '')), 'guest sees host update');
const icsHref = await gp.locator('[data-add-ics]').getAttribute('href').catch(() => null);
const gcal = await gp.locator('[data-add-gcal]').getAttribute('href').catch(() => null);
const maps = await gp.locator('[data-maps]').getAttribute('href').catch(() => null);
ok(!!icsHref && /event\.ics$/.test(icsHref) && /calendar\.google\.com/.test(gcal || '') && /maps\/search/.test(maps || ''), 'guest has Add to calendar, Google Calendar and Directions');
ok(/Please reply by/.test(await gp.locator('[data-rsvp-deadline-note]').innerText().catch(() => '')), 'RSVP deadline shown');
await gp.locator('[data-rsvp-name]').fill('Plus One Guest');
await gp.locator('[data-plus-ones-inc]').click();
await gp.locator('[data-rsvp-answer="yes"]').click(); await gp.waitForTimeout(2000);
const social = await (await fetch(`${API}/voyages/${cloudId}/social`)).json();
ok(social.guestCount === 2, `RSVP +1 → guest count ${social.guestCount}`);

// report flow
await gp.locator('[data-comment-input]').fill('totally spam link here'); await gp.locator('.vj-comment-form button[type=submit]').click(); await gp.waitForTimeout(2000);
await gp.locator('[data-report-comment]').first().click();
await gp.locator('[data-report-reason="spam"]').click();
await gp.locator('[data-report-submit]').click();
await gp.locator('[data-report-done]').waitFor({ timeout: 15000 }).catch(() => {});
ok(await gp.locator('[data-report-done]').count() > 0, 'guest reports a comment → confirmation with 24h note');
await gp.locator('[data-report-sheet] button:has-text("Done")').click().catch(() => {});
ok(await gp.locator('[data-report-voyage]').count() > 0, 'report voyage button present');

await hp.reload(); await hp.locator('[data-manage]').waitFor({ timeout: 20000 }); await hp.waitForTimeout(2500);
ok(await hp.locator('[data-report-item]').count() >= 1, 'host sees the report');
{ const hc = await hp.locator('[data-host-headcount]').textContent({ timeout: 5000 }).catch((e) => 'ERR ' + String(e).slice(0, 80)); ok(/2 guests/.test(hc), `host headcount includes +1 (${hc})`); }
await hp.locator('[data-manage-tab="photos"]').click({ timeout: 20000 }).catch(() => {}); await hp.locator('[data-report-hide]').first().click(); await hp.waitForTimeout(2000);
const s2 = await (await fetch(`${API}/voyages/${cloudId}/social`)).json();
ok(!s2.comments.some((c) => /spam link/.test(c.body)), 'host hides reported comment → gone for guests');

// legal
const lp = await gctx.newPage(); await lp.goto(BASE + '/terms'); await lp.waitForTimeout(1500);
ok(/24 hours/.test(await lp.locator('[data-takedown-note]').innerText().catch(() => '')), '/terms has the 24h takedown note');
await lp.goto(BASE + '/privacy'); await lp.waitForTimeout(1000);
ok(await lp.locator('[data-legal="privacy"]').count() > 0, '/privacy page');
ok(!herrs.length && !gerrs.length, `no page errors ${[...herrs, ...gerrs].join(' | ')}`);

// cleanup: delete the test voyage (host secret is in the host's localStorage)
const secret = await hp.evaluate((id) => { for (let i = 0; i < localStorage.length; i++) { const v = localStorage.getItem(localStorage.key(i)); if (v && v.includes(id)) { try { const j = JSON.parse(v); const f = Array.isArray(j) ? j.find((x) => x.id === id) : j[id] ?? (j.id === id ? j : null); if (f?.secret) return f.secret; } catch {} } } return null; }, cloudId);
if (secret) await fetch(`${API}/voyages/${cloudId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}`, Origin: 'https://yvelkuri-stu.github.io' } });
console.log(`cleanup: ${secret ? 'deleted' : 'kept'} ${cloudId}`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
