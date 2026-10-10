/**
 * Mobile overflow check (v0.5.1): asserts no page-level sideways scroll at
 * 360/375/390/414/420 widths across Home, Create (empty, templates sheet, sample,
 * every inspector, media importer device+library, Classic), Share host and the
 * guest invite player (old #vj1 link). Fixed-position decor is ignored.
 *
 *   pnpm --filter @voyajes/web build && pnpm --filter @voyajes/web preview --port 4310 &
 *   pnpm --filter @voyajes/web test:mobile      # BASE=… CHROME=… W=360,375 to override
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OLD_HASH = fs.readFileSync(new URL('./fixtures-old-link.hash', import.meta.url), 'utf8');
const BASE = process.env.BASE || 'http://localhost:4310';
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
  await p.locator('.vj-tl-clip').nth(1).click(); await p.waitForTimeout(300); await log('clip inspector');
  await p.locator('.vj-tl-audio').first().click(); await p.waitForTimeout(300); await log('audio inspector');
  await p.locator('.vj-tl-gap').first().click().catch(()=>{}); await p.waitForTimeout(300); await log('gap inspector');
  await p.locator('.vj-tl-text').first().click().catch(()=>{}); await p.waitForTimeout(300); await log('text inspector');
  await p.locator('[data-replace-clip]').count() || await p.locator('.vj-tl-clip').first().click();
  await p.locator('.vj-tl-clip').first().click(); await p.locator('[data-replace-clip]').click(); await p.waitForTimeout(400); await log('importer device');
  await p.locator('[role=tab]:has-text("Voyajes library")').click(); await p.waitForTimeout(400); await log('importer library');
  await p.keyboard.press('Escape'); await p.locator('.media-importer-backdrop').click({ position: { x: 5, y: 5 } }).catch(()=>{}); await p.waitForTimeout(300);
  await p.locator('.prefs-toggle-mode').click(); await p.waitForTimeout(500); await log('classic');
  await p.goto(BASE + '/create'); await p.waitForTimeout(1000); await log('classic create voyage');
  await p.locator('.prefs-toggle-mode').click(); await p.waitForTimeout(300);
  await p.goto(BASE + '/share'); await p.waitForTimeout(2500); await log('share host');
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
console.log('FAILS', fails);
await b.close();
process.exit(fails ? 1 : 0);
