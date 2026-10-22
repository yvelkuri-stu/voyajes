/**
 * Mobile overflow check (v0.5.1): asserts no page-level sideways scroll at
 * 360/375/390/414/420 widths across Home, Create (empty, templates sheet, sample,
 * every inspector incl. Pro, More menu, Save video, story wizard + Breeze), Share host and the
 * guest invite player (old #vj1 link), v1.2 ceremony templates + the editor dock
 * layout (4 grouped tabs, one primary Share, preview first). Fixed-position decor is ignored.
 * v1.2.1: simulated notch/gesture-bar/side-cutout insets — no tappable element inside an inset zone.
 *
 *   pnpm --filter @voyajes/web build && pnpm --filter @voyajes/web preview --port 4310 &
 *   pnpm --filter @voyajes/web test:mobile      # BASE=… CHROME=… W=360,375 to override
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OLD_HASH = fs.readFileSync(new URL('./fixtures-old-link.hash', import.meta.url), 'utf8');
const BASE = process.env.BASE || 'http://localhost:4310';
// tiny solid PNGs for the story-flow step
import zlib from 'node:zlib'; import os from 'node:os'; import path from 'node:path';
const mkPng = (name, rgb) => { const w = 64, h = 64; const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0] ^ (x * 4); raw[o + 1] = rgb[1] ^ (y * 4); raw[o + 2] = rgb[2]; }
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); const crc = (b) => { let c = ~0; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 2;
  const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', hd), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))])); return f; };
const PH1 = mkPng('vj-m1.png', [240, 60, 120]), PH2 = mkPng('vj-m2.png', [30, 200, 90]), PH3 = mkPng('vj-m3.png', [20, 90, 250]);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--disable-features=OverscrollHistoryNavigation'] });
const check = (p, label, W) => p.evaluate(([label, W]) => {
  const vw = W; const out = [];
  document.documentElement.style.overflowX = 'visible'; document.body.style.overflowX = 'visible';
  const isFixed = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return true; return false; };
  for (const e of document.querySelectorAll('body *')) {
    const rc = e.getBoundingClientRect(); if (!rc.width) continue;
    if ((rc.right > vw + 1 || rc.left < -1) && !isFixed(e)) {
      let a = e.parentElement, clipped = false;
      while (a && a !== document.body) { const cs = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && a.getBoundingClientRect().right <= vw + 1) { clipped = true; break; } a = a.parentElement; }
      if (!clipped) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ').slice(0,2).join('.')} R${Math.round(rc.right)} W${Math.round(rc.width)}`);
    }
  }
  return `${label} sw=${document.documentElement.scrollWidth}/${vw} iw=${innerWidth} ${(document.documentElement.scrollWidth > vw || out.length) ? 'OVER ' + JSON.stringify(out.slice(0,12)) : 'ok'}`;
}, [label, W]);
let fails = 0;
for (const w of (process.env.W || '360,375,390,414,420').split(',').map(Number)) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const log = async (l) => { const r = await check(p, `${w} ${l}`, w); if (r.includes('OVER')) fails++; console.log(r); };
  await p.goto(BASE + '/'); await p.waitForTimeout(1000); await log('home');
  await p.goto(BASE + '/create?mode=invitation'); await p.waitForTimeout(1000); await log('create empty');
  await p.locator('[aria-label="Theme & templates"]').first().click(); await p.waitForTimeout(500); await log('templates sheet');
  await p.locator('.invite-tpl-card:has-text("Birthday Blast")').first().click(); await p.waitForTimeout(2500); await log('sample loaded');
  // v1.2 clear-intent layout: one bottom dock (4 grouped tabs + Share), one primary button on screen
  {
    const L = await p.evaluate(() => {
      const d = document.querySelector('[data-editor-dock]'); const r = d?.getBoundingClientRect();
      const vis = (e) => { const rc = e.getBoundingClientRect(); return rc.width > 0 && rc.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const prim = [...document.querySelectorAll('.compose-root .btn-primary')].filter(vis).map((e) => e.textContent.trim());
      const pv = document.querySelector('.preview-stage')?.getBoundingClientRect();
      return { tabs: document.querySelectorAll('[data-editor-dock] [data-dock]').length, inView: !!r && r.bottom <= innerHeight + 1 && r.top > innerHeight / 2 && r.left >= -1 && r.right <= innerWidth + 1,
        prim, previewFirst: !!pv && pv.top < (document.querySelector('.compose-meta-chips')?.getBoundingClientRect().top ?? 1e9) };
    });
    const good = L.tabs === 4 && L.inView && L.prim.length === 1 && /Share/.test(L.prim[0]) && L.previewFirst;
    if (!good) fails++;
    console.log(`${w} layout dock tabs=${L.tabs} inView=${L.inView} primary=${JSON.stringify(L.prim)} previewFirst=${L.previewFirst} ${good ? 'ok' : 'BAD'}`);
  }
  await p.locator('.vj-tl-clip').nth(1).click(); await p.waitForTimeout(300); await log('clip inspector');
  await p.locator('.vj-tl-audio').first().click(); await p.waitForTimeout(300); await log('audio inspector');
  await p.locator('.vj-tl-gap').first().click().catch(()=>{}); await p.waitForTimeout(300); await log('gap inspector');
  await p.locator('.vj-tl-text').first().click().catch(()=>{}); await p.waitForTimeout(300); await log('text inspector');
  await p.locator('[data-replace-clip]').count() || await p.locator('.vj-tl-clip').first().click();
  await p.locator('.vj-tl-clip').first().click(); await p.locator('[data-replace-clip]').click(); await p.waitForTimeout(400); await log('importer device');
  await p.locator('[role=tab]:has-text("Voyajes library")').click(); await p.waitForTimeout(400); await log('importer library');
  await p.keyboard.press('Escape'); await p.locator('.media-importer-backdrop').click({ position: { x: 5, y: 5 } }).catch(()=>{}); await p.waitForTimeout(300);
  await p.locator('[data-pro-toggle]').click(); await p.waitForTimeout(300);
  await p.locator('.vj-tl-clip').nth(1).click(); await p.waitForTimeout(300); await log('pro clip inspector');
  await p.locator('.vj-tl-gap').first().click().catch(()=>{}); await p.waitForTimeout(300); await log('pro gap inspector');
  await p.locator('[data-pro-toggle]').click(); await p.waitForTimeout(300);
  await p.locator('.vj-more > summary').click(); await p.waitForTimeout(300); await log('more menu');
  await p.locator('.vj-more > summary').click();
  await p.locator('[data-save-video]').click(); await p.waitForTimeout(300); await log('save video panel');
  // v0.6 story flow: Home → Make a story → wizard → photos → Breeze story
  await p.goto(BASE + '/'); await p.waitForTimeout(600);
  await p.locator('[data-home-story]').click(); await p.waitForTimeout(1000); await log('wizard themes');
  await p.locator('[data-wizard-theme]').first().click(); await p.waitForTimeout(300); await log('wizard import');
  await p.locator('[data-wizard-input]').setInputFiles([PH1, PH2, PH3]);
  await p.waitForSelector('.vj-wizard', { state: 'detached', timeout: 30000 }); await p.waitForTimeout(800); await log('breeze story');
  await p.goto(BASE + '/share'); await p.waitForTimeout(2500); await log('share host');
  await p.goto(BASE + '/themes?tab=templates&filter=ceremony'); await p.waitForTimeout(1200); await log('ceremonies list');
  for (const id of ['template.mundan-sanskar', 'template.puttu-ventrukalu', 'template.mottai-kaathu-kuthu', 'template.first-haircut']) {
    await p.goto(BASE + '/create?mode=invitation&template=' + id); await p.waitForTimeout(2200); await log('ceremony ' + id.slice(9));
  }
  await p.goto(BASE + '/v/p#vj1.' + OLD_HASH); await p.waitForTimeout(1500); await log('guest player');
  await ctx.close();
}
// Gesture: a long right/left swipe on the timeline must not navigate away
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(BASE + '/create?mode=invitation'); await p.waitForTimeout(1000);
  await p.locator('[aria-label="Theme & templates"]').first().click(); await p.waitForTimeout(400);
  await p.locator('.invite-tpl-card:has-text("Birthday Blast")').first().click(); await p.waitForTimeout(2500);
  await p.locator('.vj-tl-clip').first().scrollIntoViewIfNeeded();
  const cdp = await ctx.newCDPSession(p);
  const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  for (const dir of [1, -1]) {
    const c = await p.locator('.vj-tl-clip').first().boundingBox();
    const x0 = dir > 0 ? 30 : 360;
    await tp('touchStart', x0, c.y + 15);
    for (let i = 1; i <= 14; i++) { await tp('touchMove', x0 + dir * i * 22, c.y + 15); await p.waitForTimeout(16); }
    await tp('touchEnd'); await p.waitForTimeout(700);
    const ok = p.url().includes('/create') && (await p.locator('.vj-tl-clip').count()) > 0;
    if (!ok) fails++;
    console.log(`swipe ${dir > 0 ? 'right' : 'left'} on timeline: ${ok ? 'stayed' : 'NAVIGATED ' + p.url()}`);
  }
  await ctx.close();
}
// v1.2.1 simulated display cutouts / system bars: inject the same --safe-area-inset-* vars the
// Android app's SystemBars plugin injects, then assert no interactive element sits in an inset zone.
const insetCheck = (p, label, ins) => p.evaluate(([label, ins]) => {
  const W = innerWidth, H = innerHeight, bad = [];
  const pinned = (e) => { for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const ps = getComputedStyle(a).position; if (ps === 'fixed' || ps === 'sticky') return true; } return false; };
  const clipRect = (e) => { let r = e.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) { const q = a.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom); } }
    return { L, T, R, B }; };
  for (const e of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=tab], [role=button]')) {
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || e.closest('[hidden]')) continue;
    { const d = e.closest('details:not([open])'); if (d && !e.closest('summary')) continue; }      // folded <details> content
    const { L, T, R, B } = clipRect(e); if (R - L < 2 || B - T < 2) continue;            // clipped away / zero-size
    if (B <= 0 || T >= H || R <= 0 || L >= W) continue;                                     // off screen
    const pin = pinned(e), zones = [];
    if (T < ins.t - 0.5) zones.push('top');
    if (L < ins.l - 0.5) zones.push('left');
    if (R > W - ins.r + 0.5) zones.push('right');
    if (pin && B > H - ins.b + 0.5) zones.push('bottom');
    if (zones.length) bad.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}「${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}」${zones.join('+')}`);
  }
  const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')) || 0;
  return `${label} insets t${ins.t} r${ins.r} b${ins.b} l${ins.l} (css ${sat}) ${bad.length ? 'IN-INSET ' + JSON.stringify(bad.slice(0, 10)) : 'ok'}`;
}, [label, ins]);
for (const [name, vp, ins] of [
  ['portrait-notch', { width: 390, height: 844 }, { t: 48, r: 0, b: 24, l: 0 }],
  ['landscape-cutout', { width: 844, height: 390 }, { t: 0, r: 0, b: 20, l: 40 }],
]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript((i) => { const set = () => { const r = document.documentElement; if (!r) return; for (const [k, v] of Object.entries({ top: i.t, right: i.r, bottom: i.b, left: i.l })) r.style.setProperty(`--safe-area-inset-${k}`, `${v}px`); }; set(); document.addEventListener('readystatechange', set); new MutationObserver(set).observe(document, { childList: true }); }, ins);
  const p = await ctx.newPage();
  const ic = async (l) => { const r = await insetCheck(p, `${name} ${l}`, ins); if (r.includes('IN-INSET')) fails++; console.log(r); };
  await p.goto(BASE + '/'); await p.waitForTimeout(1200); await ic('home');
  await p.goto(BASE + '/themes?tab=templates&filter=ceremony'); await p.waitForTimeout(1200); await ic('templates');
  await p.goto(BASE + '/create?mode=invitation&template=template.mundan-sanskar'); await p.waitForTimeout(3500); await ic('editor + dock');
  await p.locator('[aria-label="Theme & templates"]').first().click(); await p.waitForTimeout(700); await ic('style sheet');
  await p.locator('[aria-label="Close panel"]').click().catch(() => {});
  await p.locator('[aria-label="Text & audio"]').first().click(); await p.waitForTimeout(700); await ic('text & audio sheet');
  await p.locator('[aria-label="Close panel"]').click().catch(() => {});
  await p.locator('[data-open-story-brain]').click(); await p.waitForTimeout(800); await ic('story brain sheet');
  await p.keyboard.press('Escape'); await p.locator('[data-brain-done], .sb-backdrop').first().click({ position: { x: 5, y: 5 } }).catch(() => {}); await p.waitForTimeout(400);
  await p.goto(BASE + '/create?mode=invitation'); await p.waitForTimeout(1500);
  await p.locator('[data-dock="media"]').click(); await p.waitForTimeout(600); await ic('media importer');
  await p.goto(BASE + '/share'); await p.waitForTimeout(3000); await ic('share host');
  await p.goto(BASE + '/v/p#vj1.' + OLD_HASH); await p.waitForTimeout(1800); await ic('guest player');
  await p.goto(BASE + '/year'); await p.waitForTimeout(1500); await ic('year recap');
  await p.goto(BASE + '/live/cZZZZZZZ'); await p.waitForTimeout(1500); await ic('party camera');
  await p.goto(BASE + '/tv/cZZZZZZZ'); await p.waitForTimeout(1500); await ic('tv mode');
  await ctx.close();
}
console.log('FAILS', fails);
await b.close();
process.exit(fails ? 1 : 0);
