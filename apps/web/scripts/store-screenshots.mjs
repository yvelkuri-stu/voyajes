/**
 * Store screenshots of the LIVE app at every size the stores ask for → docs/store/screenshots/<profile>/NN-name.png
 *   BASE=https://yvelkuri-stu.github.io/voyajes node scripts/store-screenshots.mjs [profile…]
 * Publishes one demo voyage (deleted at the end).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path';

const BASE = (process.env.BASE || 'https://yvelkuri-stu.github.io/voyajes').replace(/\/$/, '');
const API = (process.env.API || 'https://voyajes-api.yeshu501.workers.dev').replace(/\/$/, '');
const OUT = path.resolve(process.env.OUT || '../../docs/store/screenshots');
const PROFILES = {
  'ios-6.9': { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, // 1320×2868
  'ios-6.5': { viewport: { width: 428, height: 926 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, // 1284×2778
  'ipad-13': { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, // 2064×2752
  'android-phone': { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, // 1080×1920
  'android-tablet-10': { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, // 2560×1600
  'windows-desktop': { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, // 1920×1080
};
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PROFILES);

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
const SRC = path.resolve('public/library/photos');
const stops = [[19.076, 72.8777, '2026:03:01 08:10:00'], [18.7546, 73.4062, '2026:03:01 11:30:00'], [18.5204, 73.8567, '2026:03:02 10:00:00'], [16.705, 74.2433, '2026:03:03 09:00:00'], [15.4909, 73.8278, '2026:03:04 18:20:00']];
const tmp = fs.mkdtempSync('/tmp/vj-shots-');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const conv = await b.newPage();
const files = [];
for (let i = 0; i < 5; i++) {
  const webp = fs.readFileSync(path.join(SRC, `tpl-road-trip-recap-${i + 1}.webp`)).toString('base64');
  const jpg = Buffer.from(await conv.evaluate(async (w) => { const bl = await (await fetch('data:image/webp;base64,' + w)).blob(); const bm = await createImageBitmap(bl); const c = document.createElement('canvas'); c.width = 1440; c.height = 1440; c.getContext('2d').drawImage(bm, 0, 0, 1440, 1440); const j = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(j); }); }, webp), 'base64');
  const f = path.join(tmp, `trip-${i + 1}.jpg`);
  fs.writeFileSync(f, Buffer.concat([jpg.subarray(0, 2), exif(...stops[i]), jpg.subarray(2)]));
  files.push(f);
}
await conv.close();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hideChrome = (p) => p.addStyleTag({ content: '.vj-toast,.update-toast,[data-update-toast],.cookie-banner{display:none!important}' }).catch(() => {});

async function makeStory(p) {
  await p.goto(BASE + '/create?fresh=1'); await sleep(2000);
  await p.locator('input[type=file]').first().setInputFiles(files); await sleep(3500);
  await p.locator('[data-open-story-brain]').click();
  await p.locator('[data-brain-prompt]').fill('Road trip from Mumbai to Goa, cinematic');
  await sleep(1500);
}

// one shared cloud voyage for the guest player + capsule shots
const setup = await (await b.newContext({ viewport: { width: 430, height: 900 } })).newPage();
await makeStory(setup);
await setup.locator('[data-brain-route]').check().catch(() => {});
await setup.locator('[data-brain-make]').click(); await sleep(600); await setup.locator('.sb-x').click(); await sleep(1500);
await setup.locator('button:has-text("Share")').first().click(); await setup.waitForURL(/\/v\//);
await setup.locator('[data-publish]').waitFor({ timeout: 20000 }); await sleep(1200); await setup.locator('[data-publish]').click();
await setup.locator('[data-short-link]').waitFor({ timeout: 90000 });
const cloudId = (await setup.locator('[data-short-link]').innerText()).trim().split('/').pop();
console.log('demo voyage', cloudId);

for (const name of want) {
  const dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ ...PROFILES[name], acceptDownloads: true });
  const p = await ctx.newPage();
  const shot = async (n) => { await hideChrome(p); await p.screenshot({ path: path.join(dir, n + '.png') }); console.log(name, n); };
  await p.goto(BASE + '/'); await sleep(2500); await shot('01-home');
  await makeStory(p); await sleep(1200); await shot('03-story-brain');
  await p.locator('[data-brain-make]').click(); await sleep(800); await p.locator('.sb-x').click(); await sleep(2500);
  await shot('02-editor');
  // guest player, a few seconds in (route map then photos)
  const g = await ctx.newPage();
  await g.goto(`${BASE}/v/${cloudId}`); await sleep(3000);
  await g.locator('button:has-text("Play")').first().click().catch(() => {});
  await sleep(1400); await hideChrome(g); await g.screenshot({ path: path.join(dir, '04-route-map.png') }); console.log(name, '04-route-map');
  await sleep(3200); await hideChrome(g); await g.screenshot({ path: path.join(dir, '05-player.png') }); console.log(name, '05-player');
  await g.close();
  // year in voyages (needs a local share in this context)
  await p.locator('button:has-text("Share")').first().click(); await p.waitForURL(/\/v\//); await sleep(2000);
  await p.goto(BASE + '/year'); await sleep(4300); await shot('06-year');
  await ctx.close();
}

// capsule countdown
const secret = await setup.evaluate((id) => JSON.parse(localStorage.getItem('voyajes.hostVoyages.v1') || '[]').find((x) => x.id === id)?.secret, cloudId);
await fetch(`${API}/voyages/${cloudId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Origin: 'https://yvelkuri-stu.github.io' }, body: JSON.stringify({ unlockAt: Date.now() + (30 * 86400 + 5 * 3600) * 1000 }) });
for (const name of want) {
  const ctx = await b.newContext(PROFILES[name]); const p = await ctx.newPage();
  await p.goto(`${BASE}/v/${cloudId}`); await p.locator('[data-capsule-locked]').waitFor({ timeout: 20000 }).catch(() => {}); await sleep(1500);
  await hideChrome(p); await p.screenshot({ path: path.join(OUT, name, '07-time-capsule.png') }); console.log(name, '07-time-capsule');
  await ctx.close();
}
if (secret) await fetch(`${API}/voyages/${cloudId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}`, Origin: 'https://yvelkuri-stu.github.io' } });
console.log('deleted demo', cloudId);
await b.close();
