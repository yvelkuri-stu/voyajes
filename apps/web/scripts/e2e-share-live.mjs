/**
 * Share-link e2e (v0.5.2): build a project like a user, press the real Share UI
 * "Copy" button, read the exact clipboard string, open it in a FRESH context
 * (no storage, service workers blocked) and assert media pixels are visible.
 *
 *   BASE=https://yvelkuri-stu.github.io/voyajes node scripts/e2e-share-live.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const BASE = (process.env.BASE || 'https://yvelkuri-stu.github.io/voyajes').replace(/\/$/, '');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vj-share-'));

// tiny valid PNG writer (solid colour + stripes) so the test has "device photos"
function png(file, w, h, rgb, noise = false) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const s = noise ? 0.4 + Math.random() * 0.6 : ((x >> 4) + (y >> 4)) % 2 ? 1 : 0.55;
      raw[o] = rgb[0] * s; raw[o + 1] = rgb[1] * s; raw[o + 2] = rgb[2] * s;
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  return file;
}
const A = png(path.join(tmp, 'a.png'), 640, 640, [240, 60, 120]);
const B = png(path.join(tmp, 'b.png'), 640, 480, [40, 160, 240]);
const C = png(path.join(tmp, 'c.png'), 480, 640, [250, 200, 40]);
// "real phone photo" stand-ins: big, noisy (hard to compress)
const BIG = [0, 1, 2, 3].map((i) => png(path.join(tmp, `big${i}.png`), 1600, 1600, [200 - i * 40, 90 + i * 30, 160], true));
const MAX_LINK = 80_000;

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let fails = 0;

async function scenario(name, build) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  await build(p);
  await p.locator('button:has-text("Share")').first().click();
  await p.waitForURL(/\/v\//, { timeout: 20000 });
  const copyBtn = p.locator('button:has-text("Copy invite link"), button:has-text("Copy link")').first();
  await copyBtn.waitFor({ timeout: 20000 });
  // wait until the portable link is ready (Copy refuses while preparing)
  let link = '';
  for (let i = 0; i < 30 && !link.includes('#vj1.'); i++) {
    await copyBtn.click(); await p.waitForTimeout(700);
    link = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  }
  const bar = p.url();
  await ctx.close();

  const g = await b.newContext({ viewport: { width: 400, height: 820 }, serviceWorkers: 'block' });
  const gp = await g.newPage();
  const errs = []; gp.on('pageerror', (e) => errs.push(String(e)));
  await gp.goto(link, { waitUntil: 'load' });
  await gp.waitForTimeout(4500);
  const res = await gp.evaluate(() => {
    const vis = [...document.querySelectorAll('img, video')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 120 && r.height > 120 && getComputedStyle(e).opacity !== '0' && !/brand|logo/.test(e.currentSrc || e.src);
    });
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    let best = 0;
    for (const e of vis) {
      try {
        x.clearRect(0, 0, 64, 64); x.drawImage(e, 0, 0, 64, 64);
        const d = x.getImageData(0, 0, 64, 64).data; let s = 0, s2 = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; n++; }
        const mean = s / n; const sd = Math.sqrt(s2 / n - mean * mean);
        best = Math.max(best, mean > 8 ? sd + mean / 10 : 0);
      } catch { /* tainted */ }
    }
    return { media: vis.length, pixelScore: Math.round(best), text: document.body.innerText.slice(0, 160).replace(/\n/g, ' | ') };
  });
  const ok = link.includes('#vj1.') && link.length <= MAX_LINK && res.media > 0 && res.pixelScore > 10 && !errs.length;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: copied ${link.length} chars (hash ${link.includes('#vj1.')}) · address bar has hash ${bar.includes('#vj1.')} · guest media ${res.media} · pixel score ${res.pixelScore}${errs.length ? ' · errors ' + errs.join(';') : ''}`);
  console.log(`      guest text: ${res.text}`);
  await g.close();
}

const openTemplate = async (p, name) => {
  await p.locator('[aria-label="Theme & templates"], button:has-text("Templates")').first().click().catch(() => {});
  await p.waitForTimeout(400);
  await p.locator(`.invite-tpl-card:has-text("${name}")`).first().click();
  await p.waitForSelector('.vj-tl-clip', { timeout: 20000 }); await p.waitForTimeout(1500);
};

await scenario('voyage · user photos', async (p) => {
  await p.goto(BASE + '/create'); await p.waitForTimeout(1500);
  await p.locator('input[type=file]').first().setInputFiles([A, B]); await p.waitForTimeout(1500);
});
await scenario('invitation · template sample + replaced device photo + library swap', async (p) => {
  await p.goto(BASE + '/create?mode=invitation'); await p.waitForTimeout(1500);
  await openTemplate(p, 'Birthday Blast');
  await p.locator('.vj-tl-clip').nth(0).click(); await p.locator('[data-replace-clip]').click(); await p.waitForTimeout(300);
  await p.locator('[role=tab]:has-text("From device")').click();
  await p.locator('.media-importer-sheet input[type=file]').setInputFiles(C); await p.waitForTimeout(1500);
  await p.locator('.vj-tl-clip').nth(1).click(); await p.locator('[data-replace-clip]').click(); await p.waitForTimeout(300);
  await p.locator('[role=tab]:has-text("Voyajes library")').click(); await p.waitForTimeout(300);
  await p.locator('.media-library-card').nth(3).click(); await p.waitForTimeout(1500);
});
await scenario('voyage · 4 big noisy photos (link must shrink, not break)', async (p) => {
  await p.goto(BASE + '/create'); await p.waitForTimeout(1500);
  await p.locator('input[type=file]').first().setInputFiles(BIG); await p.waitForTimeout(3000);
});
await scenario('invitation · untouched template sample (library media only)', async (p) => {
  await p.goto(BASE + '/create?mode=invitation'); await p.waitForTimeout(1500);
  await openTemplate(p, 'Diwali');
});

// A bare local-only /v/<id> must not render blank: it explains what happened
{
  const g = await b.newContext({ serviceWorkers: 'block' }); const gp = await g.newPage();
  await gp.goto(BASE + '/v/vj_doesnotexist'); await gp.waitForTimeout(2500);
  const t = await gp.locator('body').innerText();
  const ok = /no invite attached|cut off|ask the host/i.test(t);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} bare /v/<id> without payload shows guidance: ${t.slice(0, 140).replace(/\n/g, ' | ')}`);
  await g.close();
}

await b.close();
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
