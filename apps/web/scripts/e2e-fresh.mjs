/**
 * Start-fresh e2e (v0.8): build a messy project like a user (template sample,
 * replaced photo, theme change, Pro, invitation fields), then every "start
 * over" path must leave NOTHING behind — in memory, localStorage, IndexedDB,
 * and after a reload.
 *   BASE=https://yvelkuri-stu.github.io/voyajes node scripts/e2e-fresh.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';

const BASE = (process.env.BASE || 'http://localhost:4310').replace(/\/$/, '');
const png = (name, rgb) => { const w = 200, h = 200; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = (rgb[1] + x) & 255; raw[o + 2] = rgb[2]; }
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); const crc = (b) => { let c = ~0; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 2;
  const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', hd), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))])); return f; };
const A = png('vjf-a.png', [230, 40, 90]), B = png('vjf-b.png', [20, 120, 230]);

const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
const ok = (c, l) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const state = (p) => p.evaluate(async () => {
  const d = JSON.parse(localStorage.getItem('voyajes.draft.v1') || 'null');
  const prefs = JSON.parse(localStorage.getItem('voyajes.prefs.v1') || '{}');
  const blobs = await new Promise((res) => { const r = indexedDB.open('voyajes-media-v1'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('blobs')) return res(0); const q = db.transaction('blobs').objectStore('blobs').count(); q.onsuccess = () => { res(q.result); db.close(); }; }; r.onerror = () => res(-1); });
  const ui = { clips: document.querySelectorAll('.vj-tl-clip').length, texts: document.querySelectorAll('.vj-tl-text').length, audio: document.querySelectorAll('.vj-tl-audio-clip').length };
  return { d, pro: !!prefs.pro, blobs, ui, title: document.querySelector('[data-story-title]')?.textContent ?? '' };
});
const leftovers = (s, mode) => {
  const d = s.d || {}; const bad = [];
  if (!s.d) bad.push('no draft');
  if ((d.clips || []).length) bad.push(`clips ${d.clips.length}`);
  if ((d.textOverlays || []).length) bad.push(`text ${d.textOverlays.length}`);
  if ((d.audioClips || []).length) bad.push(`audio ${d.audioClips.length}`);
  if ((d.customSounds || []).length) bad.push('custom sounds');
  if (d.templateId) bad.push(`template ${d.templateId}`);
  if (d.themeId !== 'theme.ocean-pop') bad.push(`theme ${d.themeId}`);
  if (d.grade || d.defaultAnimation || d.transitionSpec || d.transitionOverride) bad.push('pro overrides');
  for (const k of ['hostName', 'guestName', 'eventName', 'eventType', 'eventWhen', 'eventWhere', 'captionText']) if (d[k]) bad.push(`${k}=${d[k]}`);
  if (d.aspect !== '9:16') bad.push(`aspect ${d.aspect}`);
  if (d.exportDestination !== 'custom') bad.push(`export ${d.exportDestination}`);
  if (d.shareId) bad.push('shareId');
  if (d.mode !== mode) bad.push(`mode ${d.mode}`);
  if (s.pro) bad.push('pro on');
  if (s.blobs !== 0) bad.push(`blobs ${s.blobs}`);
  if (s.ui.clips || s.ui.texts || s.ui.audio) bad.push(`ui ${JSON.stringify(s.ui)}`);
  return bad;
};

const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('voyajes.onboarded.v1', '1'));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));

/** Make a mess the way a user does. */
const mess = async () => {
  await p.goto(BASE + '/create?mode=invitation'); await p.waitForTimeout(1500);
  await p.locator('[aria-label="Theme & templates"], button:has-text("Templates")').first().click().catch(() => {});
  await p.waitForTimeout(400);
  await p.locator('.invite-tpl-card').nth(2).click();
  await p.waitForSelector('.vj-tl-clip', { timeout: 20000 }); await p.waitForTimeout(800);
  await p.locator('.vj-tl-clip').nth(0).click(); await p.locator('[data-replace-clip]').click(); await p.waitForTimeout(300);
  await p.locator('[role=tab]:has-text("From device")').click();
  await p.locator('.media-importer-sheet input[type=file]').setInputFiles(A); await p.waitForTimeout(1200);
  await p.locator('input[type=file]').first().setInputFiles(B).catch(() => {}); await p.waitForTimeout(1200);
  // Pro + theme switch + invitation fields + aspect via storage-backed UI state
  await p.evaluate(() => { const k = 'voyajes.prefs.v1'; const v = JSON.parse(localStorage.getItem(k) || '{}'); v.pro = true; localStorage.setItem(k, JSON.stringify(v)); });
  const host = p.locator('input[placeholder*="ost" i]').first(); if (await host.count()) await host.fill('Messy Host').catch(() => {});
  await p.waitForTimeout(1000);
  const s = await state(p);
  return s;
};

const before = await mess();
ok(before.d.clips.length > 0 && before.blobs > 0 && before.d.templateId, `setup: messy project (${before.d.clips.length} clips, ${before.blobs} blobs, template ${before.d.templateId}, theme ${before.d.themeId})`);
const oldPid = before.d.projectId;

const check = async (label, mode) => {
  await p.waitForTimeout(2500);
  const s1 = await state(p);
  const bad1 = leftovers(s1, mode);
  await p.reload(); await p.waitForTimeout(2500);
  const s2 = await state(p);
  const bad2 = leftovers(s2, mode);
  const newId = s2.d?.projectId && s2.d.projectId !== oldPid;
  ok(!bad1.length && !bad2.length && newId, `${label}: ${bad1.length || bad2.length ? 'leftovers ' + [...bad1, ...bad2.map((x) => 'after reload: ' + x)].join(', ') : 'nothing survives (also after reload)'}${newId ? '' : ' · project id not renewed'}`);
};

// 1. Home → Make a story
await p.goto(BASE + '/'); await p.waitForTimeout(800);
await p.locator('[data-home-story]').click();
await p.locator('.vj-wizard-close, [data-wizard-close]').first().click({ timeout: 3000 }).catch(() => {});
await check('Home → Make a story', 'voyage');

// 2. Home → Make an invitation
await mess();
await p.goto(BASE + '/'); await p.waitForTimeout(800);
await p.locator('a:has-text("Make an invitation")').click();
await check('Home → Make an invitation', 'invitation');

// 3. Templates → Start from scratch
await mess();
await p.locator('[aria-label="Theme & templates"], button:has-text("Templates")').first().click().catch(() => {});
await p.waitForTimeout(400);
await p.locator('button:has-text("Start from scratch"), [data-start-scratch]').first().click();
await p.locator('[data-fresh-confirm]').click({ timeout: 3000 }).catch(() => {});
await check('Templates → Start from scratch', 'invitation');

// 4. ⋯ → Start fresh (confirm sheet) + Undo
const m4 = await mess();
await p.locator('.vj-more > summary').click();
await p.locator('[data-start-fresh]').click();
ok(await p.locator('text=Clear everything and start over?').isVisible().catch(() => false), '⋯ Start fresh asks "Clear everything and start over?"');
await p.locator('[data-fresh-confirm]').click();
await p.waitForTimeout(1200);
const undo = p.locator('[data-fresh-undo]');
ok(await undo.isVisible().catch(() => false), 'Undo toast shown');
await undo.click(); await p.waitForTimeout(2000);
const u = await state(p);
ok(u.d.clips.length === m4.d.clips.length && u.blobs === m4.blobs && u.ui.clips === m4.d.clips.length, `Undo restores the project (${u.d.clips.length}/${m4.d.clips.length} clips, ${u.blobs}/${m4.blobs} blobs)`);
await p.locator('.vj-more > summary').click();
await p.locator('[data-start-fresh]').click();
await p.locator('[data-fresh-confirm]').click();
await check('⋯ Start fresh', 'invitation');

// 5. Home "Start fresh" (draft exists)
await mess();
await p.goto(BASE + '/'); await p.waitForTimeout(800);
await p.locator('[data-home-fresh]').click();
await p.locator('[data-fresh-confirm]').click();
await p.waitForURL(/\/create/); 
await check('Home → Start fresh', 'voyage');

ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await b.close();
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
