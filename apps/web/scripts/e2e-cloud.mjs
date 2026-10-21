/**
 * Cloud e2e (v0.7): publish → short link in a fresh context shows media →
 * guest reacts, RSVPs and drops a photo → host sees it all in Manage →
 * "Add to story" → guest sees the new clip.
 *   BASE=https://yvelkuri-stu.github.io/voyajes API=https://voyajes-api.<sub>.workers.dev node scripts/e2e-cloud.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';

const BASE = (process.env.BASE || 'http://localhost:4310').replace(/\/$/, '');
const API = (process.env.API || 'http://127.0.0.1:8787').replace(/\/$/, '');
const png = (name, rgb) => { const w = 320, h = 320; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const s = ((x >> 5) + (y >> 5)) % 2 ? 1 : 0.5; raw[o] = rgb[0] * s; raw[o + 1] = rgb[1] * s; raw[o + 2] = rgb[2] * s; }
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); const crc = (b) => { let c = ~0; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 2;
  const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', hd), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))])); return f; };
const A = png('vjc-a.png', [240, 60, 120]), B = png('vjc-b.png', [40, 160, 240]), G = png('vjc-guest.png', [250, 200, 40]);

const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
const ok = (cond, label) => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); };
const pixelScore = (p) => p.evaluate(async () => {
  const vis = [...document.querySelectorAll('img, video')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 120 && r.height > 120 && !/brand|logo/.test(e.currentSrc || e.src); });
  let best = 0;
  for (const e of vis) {
    try {
      const src = e.currentSrc || e.src; let bmp;
      if (e.tagName === 'IMG') bmp = await createImageBitmap(await (await fetch(src)).blob()); else bmp = e;
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, 64, 64);
      const d = x.getImageData(0, 0, 64, 64).data; let s = 0, s2 = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; n++; }
      const mean = s / n; best = Math.max(best, mean > 8 ? Math.sqrt(s2 / n - mean * mean) + mean / 10 : 0);
    } catch { /* ignore */ }
  }
  return Math.round(best);
});

// host
const hctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const hp = await hctx.newPage();
await hp.goto(BASE + '/create?mode=invitation'); await hp.waitForTimeout(1500);
await hp.locator('input[type=file]').first().setInputFiles([A, B]); await hp.waitForTimeout(1500);
await hp.locator('button:has-text("Share")').first().click();
await hp.waitForURL(/\/v\//);
const pub = hp.locator('[data-publish]'); await pub.waitFor({ timeout: 20000 });
await hp.waitForTimeout(1500);
await pub.click();
await hp.locator('[data-short-link]').waitFor({ timeout: 60000 });
const shortUrl = (await hp.locator('[data-short-link]').innerText()).trim();
ok(/\/v\/c[0-9A-Za-z]{7}$/.test(shortUrl), `publish → short link ${shortUrl}`);
const cloudId = shortUrl.split('/').pop();
await hp.locator('[data-manage]').waitFor({ timeout: 20000 });
await hp.locator('[data-manage-tab="photos"]').click({ timeout: 20000 }).catch(() => {}); await hp.locator('[data-drops-toggle]').click(); await hp.waitForFunction(() => document.querySelector('[data-drops-toggle]')?.checked, null, { timeout: 15000 });

// guest (fresh context, no storage, no SW)
const gctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
const gp = await gctx.newPage();
const errs = []; gp.on('pageerror', (e) => errs.push(String(e)));
await gp.goto(shortUrl); await gp.waitForTimeout(5000);
const score = await pixelScore(gp);
ok(score > 10 && !errs.length, `short link in fresh context shows media (pixel score ${score})${errs.length ? ' errors ' + errs : ''}`);
await gp.locator('[data-react="🔥"]').click(); await gp.waitForTimeout(600);
await gp.locator('[data-rsvp-name]').fill('Asha E2E');
await gp.locator('[data-rsvp-answer="yes"]').click(); await gp.waitForTimeout(1500);
await gp.locator('[data-guest-drop-input]').setInputFiles(G); await gp.waitForTimeout(3000);
const social = await (await fetch(`${API}/voyages/${cloudId}/social`)).json();
ok(social.reactions['🔥'] >= 1 && social.attending.includes('Asha E2E'), `reaction + RSVP round-trip (🔥 ${social.reactions['🔥']}, going: ${social.attending.join(', ')})`);
await gp.waitForTimeout(800);
const ribbon = await gp.locator('.vj-attending').innerText().catch(() => '');
ok(/Asha E2E/.test(ribbon), 'guest page shows animated attending names');

// host sees queue + guest list, adds the photo to the story
await hp.reload(); await hp.locator('[data-manage]').waitFor({ timeout: 20000 }); await hp.waitForTimeout(2000);
const drops = await hp.locator('[data-drop-item]').count();
const list = await hp.locator('[data-guestlist]').innerText().catch(() => '');
ok(drops === 1 && /Asha E2E/.test(list), `host Manage: ${drops} photo in queue, guest list "${list.replace(/\n/g, ' ')}"`);
await hp.locator('[data-manage-tab="photos"]').click({ timeout: 20000 }).catch(() => {}); await hp.locator('[data-drop-add]').first().click(); await hp.waitForTimeout(2500);
const v = await (await fetch(`${API}/voyages/${cloudId}`)).json();
ok(v.pack.share.playback.clips.length === 3, `"Add to story" appends the guest photo (clips ${v.pack.share.playback.clips.length})`);

// remix
await gp.reload(); await gp.waitForTimeout(4000);
await gp.locator('[data-remix]').click();
await gp.waitForURL(/\/create/, { timeout: 30000 }); await gp.waitForTimeout(2500);
ok((await gp.locator('.vj-tl-clip').count()) === 3, `Remix forks into the guest's draft (${await gp.locator('.vj-tl-clip').count()} clips)`);

await b.close();
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
