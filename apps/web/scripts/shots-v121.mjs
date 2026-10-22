/** v1.2.1 phone screenshots with a SIMULATED display cutout / gesture bar (insets injected exactly like
 * the Android app's SystemBars plugin; the pink band visualises the inset zones).
 *   BASE=https://yvelkuri-stu.github.io/voyajes node scripts/shots-v121.mjs /workspace/shots/v1.2.1 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:4310';
const API = process.env.API || 'https://voyajes-api.yeshu501.workers.dev';
const OUT = process.argv[2] || '/workspace/shots/v1.2.1'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const mk = async (vp, ins) => {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript((i) => { const set = () => { const r = document.documentElement; if (!r) return; r.classList.add('vj-show-insets'); for (const [k, v] of Object.entries(i)) r.style.setProperty(`--safe-area-inset-${k}`, `${v}px`); }; set(); document.addEventListener('readystatechange', set); new MutationObserver(set).observe(document, { childList: true }); }, ins);
  return ctx;
};
const ctx = await mk({ width: 390, height: 844 }, { top: 48, right: 0, bottom: 24, left: 0 });
const p = await ctx.newPage();
const shot = async (n, pg = p) => { await pg.screenshot({ path: `${OUT}/${n}.png` }); console.log(`${OUT}/${n}.png`); };
await p.goto(`${BASE}/`); await p.waitForTimeout(2500); await shot('01-home-notch');
await p.goto(`${BASE}/create?mode=invitation&template=template.mottai-kaathu-kuthu`);
await p.waitForFunction(() => document.querySelectorAll('.vj-tl-clip').length >= 3, null, { timeout: 25000 });
await p.waitForTimeout(1000); await p.locator('button.btn-play').click(); await p.waitForTimeout(1800); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300); await shot('02-editor-notch');
await p.locator('button.btn-play').click();
await p.locator('[aria-label="Theme & templates"]').click(); await p.waitForTimeout(900); await shot('03-editor-style-sheet-notch');
await p.locator('[aria-label="Close panel"]').click();
await p.locator('[data-open-story-brain]').click(); await p.waitForTimeout(900); await shot('04-story-brain-sheet-notch');
await p.keyboard.press('Escape'); await p.locator('.sb-backdrop').click({ position: { x: 5, y: 60 } }).catch(() => {}); await p.waitForTimeout(400);
await p.locator('[data-primary-share]').click(); await p.waitForURL(/\/v\//, { timeout: 30000 });
await p.locator('[data-publish]').waitFor({ timeout: 20000 }); await p.waitForTimeout(1500);
await p.locator('[data-publish]').click();
await p.locator('[data-short-link]').waitFor({ timeout: 90000 });
const cloudId = (await p.locator('[data-short-link]').innerText()).trim().split('/').pop();
await p.locator('[data-manage]').waitFor({ timeout: 30000 }); await p.waitForTimeout(2500);
await p.locator('[data-manage]').evaluate((e) => e.scrollIntoView({ block: 'start' })); await p.evaluate(() => scrollBy(0, -60)); await p.waitForTimeout(600); await shot('05-manage-tabs-notch');
await p.locator('[data-share-details]').evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(500); await shot('06-share-details-folded-notch');
// guest view + party camera on a second "phone"
const g = await (await mk({ width: 390, height: 844 }, { top: 48, right: 0, bottom: 24, left: 0 })).newPage();
await g.goto(`${BASE}/v/${cloudId}`); await g.waitForTimeout(3500); await shot('07-guest-invite-notch', g);
await g.goto(`${BASE}/live/${cloudId}`); await g.waitForTimeout(2500); await shot('08-party-camera-notch', g);
await g.goto(`${BASE}/year`); await g.waitForTimeout(2000); await shot('09-year-notch', g);
// landscape with a side cutout
const l = await (await mk({ width: 844, height: 390 }, { top: 0, right: 0, bottom: 20, left: 40 })).newPage();
await l.goto(`${BASE}/create?mode=invitation&template=template.first-haircut`);
await l.waitForFunction(() => document.querySelectorAll('.vj-tl-clip').length >= 3, null, { timeout: 25000 }); await l.waitForTimeout(1500); await shot('10-editor-landscape-cutout', l);
await l.goto(`${BASE}/tv/${cloudId}`); await l.waitForTimeout(2500); await shot('11-tv-landscape-cutout', l);
const secret = await p.evaluate((id) => { for (let i = 0; i < localStorage.length; i++) { const v = localStorage.getItem(localStorage.key(i)); if (v && v.includes(id)) { try { const j = JSON.parse(v); const f = Array.isArray(j) ? j.find((x) => x.id === id) : j[id] ?? (j.id === id ? j : null); if (f?.secret) return f.secret; } catch {} } } return null; }, cloudId);
if (secret) await fetch(`${API}/voyages/${cloudId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}`, Origin: 'https://yvelkuri-stu.github.io' } });
console.log(`cleanup: ${secret ? 'deleted' : 'kept'} ${cloudId}`);
await b.close();
