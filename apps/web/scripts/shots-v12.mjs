/** v1.2 phone screenshots (390×844 @2x): Home, editor, Manage, ceremony templates.
 *   BASE=https://yvelkuri-stu.github.io/voyajes API=… node scripts/shots-v12.mjs /workspace/shots/v1.2 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:4310';
const API = process.env.API || 'https://voyajes-api.yeshu501.workers.dev';
const OUT = process.argv[2] || '/workspace/shots/v1.2'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const shot = async (n) => { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log(`${OUT}/${n}.png`); };
await p.goto(`${BASE}/`); await p.waitForTimeout(2500); await shot('01-home');
await p.goto(`${BASE}/themes?tab=templates&filter=ceremony`); await p.waitForTimeout(2500); await shot('02-templates-ceremonies');
await p.locator('.grid-themes > button.card', { hasText: 'Puttu' }).first().click();
await p.waitForFunction(() => document.querySelectorAll('.vj-tl-clip').length >= 3, null, { timeout: 25000 });
await p.waitForTimeout(1200); await p.locator('button.btn-play').click(); await p.waitForTimeout(3600); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300); await shot('03-tonsure-puttu-preview');
await p.locator('button.btn-play').click();
await p.goto(`${BASE}/create?mode=invitation&template=template.mundan-sanskar`);
await p.waitForFunction(() => document.querySelectorAll('.vj-tl-clip').length >= 3, null, { timeout: 25000 });
await p.waitForTimeout(1200); await p.locator('button.btn-play').click(); await p.waitForTimeout(1500); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300); await shot('04-editor');
await p.locator('button.btn-play').click();
await p.locator('[aria-label="Theme & templates"]').click(); await p.waitForTimeout(900); await shot('05-editor-style-tab');
await p.locator('[aria-label="Close panel"]').click();
await p.locator('[data-primary-share]').click(); await p.waitForURL(/\/v\//, { timeout: 30000 });
await p.locator('[data-publish]').waitFor({ timeout: 20000 }); await p.waitForTimeout(1500);
await p.locator('[data-publish]').click();
await p.locator('[data-short-link]').waitFor({ timeout: 90000 });
const cloudId = (await p.locator('[data-short-link]').innerText()).trim().split('/').pop();
await p.locator('[data-manage]').waitFor({ timeout: 30000 }); await p.waitForTimeout(2500);
await p.locator('[data-sec="send"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(600); await shot('06-share-host');
await p.locator('[data-manage]').evaluate((e) => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(600); await shot('07-manage-guests');
await p.locator('[data-manage-tab="photos"]').click(); await p.waitForTimeout(500); await shot('08-manage-photos');
await p.locator('[data-manage-tab="share"]').click(); await p.waitForTimeout(800); await shot('09-manage-share-print');
await p.locator('[data-manage-tab="after"]').click(); await p.waitForTimeout(800); await shot('10-manage-aftermovie');
// cleanup: delete the demo voyage with its host secret
const secret = await p.evaluate((id) => { for (let i = 0; i < localStorage.length; i++) { const v = localStorage.getItem(localStorage.key(i)); if (v && v.includes(id)) { try { const j = JSON.parse(v); const f = Array.isArray(j) ? j.find((x) => x.id === id) : j[id] ?? (j.id === id ? j : null); if (f?.secret) return f.secret; } catch {} } } return null; }, cloudId);
if (secret) await fetch(`${API}/voyages/${cloudId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}`, Origin: 'https://yvelkuri-stu.github.io' } });
console.log(`cleanup: ${secret ? 'deleted' : 'kept'} ${cloudId}`);
await b.close();
