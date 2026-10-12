/**
 * Themes e2e (v0.8): a theme must visibly transform the CURRENT story —
 * grade + film fx on the stage, its own music, re-timed cuts with its
 * transitions, intro/outro cards — and the same look must reach the saved
 * video and the guest page.
 *   BASE=https://yvelkuri-stu.github.io/voyajes node scripts/e2e-themes.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';

const BASE = (process.env.BASE || 'http://localhost:4310').replace(/\/$/, '');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vjt-'));
// colourful test photos (from the library) as JPEGs
const photos = ['tpl-weekend-goa-1', 'tpl-weekend-goa-3', 'tpl-wedding-weekend-1'].map((n) => {
  const out = path.join(tmp, n + '.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(HERE, '../public/library/photos', n + '.webp'), out]);
  return out;
});
/** mean saturation / brightness of a PNG via ffmpeg signalstats (0..1) */
const stats = (png) => {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', png, '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
  const g = (k) => Number((out.match(new RegExp(`lavfi.signalstats.${k}=([0-9.]+)`)) || [])[1] || 0);
  return { sat: g('SATAVG') / 128, y: g('YAVG') / 255 };
};

const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
const ok = (c, l) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
await ctx.addInitScript(() => localStorage.setItem('voyajes.onboarded.v1', '1'));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const draft = () => p.evaluate(() => JSON.parse(localStorage.getItem('voyajes.draft.v1') || '{}'));
const shot = async (name) => { const f = path.join(tmp, name + '.png'); await p.locator('.preview-stage').screenshot({ path: f }); return f; };

await p.goto(BASE + '/create'); await p.waitForTimeout(1500);
await p.locator('input[type=file]').first().setInputFiles(photos); await p.waitForTimeout(2000);
await p.locator('[aria-label="Theme & templates"]').first().click(); await p.waitForTimeout(600);
ok(await p.locator('[data-look]').count() >= 8, `theme carousel shows ${await p.locator('[data-look]').count()} looks rendered on your own photo`);
const before = await draft();
const s0 = stats(await shot('ocean'));

// 1. Neon Night
await p.locator('[data-look="theme.neon-night"]').click();
await p.waitForTimeout(150);
ok(await p.locator('.vj-theme-wipe').count() > 0, 'theme-switch wipe animation plays');
await p.waitForTimeout(1500);
let d = await draft();
const tx = new Set(['whip', 'glitch', 'zoom-through', 'flash']);
ok(d.themeId === 'theme.neon-night', 'theme applied');
ok(d.audioClips?.[0]?.ref === 'audio.neon-pulse-118@1.0.0' && d.audioClips[0].ref !== before.audioClips?.[0]?.ref, `music auto-swapped → ${d.audioClips?.[0]?.label}`);
ok(d.clips.slice(0, -1).every((c) => tx.has(c.transitionOut)), `cuts use the theme's transitions (${d.clips.map((c) => c.transitionOut).join(', ')})`);
const beat = 60 / 118; const hold = d.clips[0].durationSec - (d.clips[0].transitionSpec?.durationSec ?? 0);
ok(Math.abs(hold / beat - Math.round(hold / beat)) < 0.02 && JSON.stringify(d.clips.map((c) => c.durationSec)) !== JSON.stringify(before.clips.map((c) => c.durationSec)), `cuts re-timed to 118 BPM (${d.clips.map((c) => c.durationSec).join('/')})`);
ok(d.textOverlays.some((t) => t.id === 'theme-intro' && /AFTER DARK/.test(t.value)) && d.textOverlays.some((t) => t.id === 'theme-outro'), 'intro + outro cards added in the theme typography');
const fxPixels = await p.evaluate(() => [...document.querySelectorAll('.vj-fx-layer canvas')].reduce((n, c) => { const x = c.getContext('2d'); if (!c.width) return n; const d = x.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 0) n++; return n; }, 0));
ok(fxPixels > 500, `live film-fx layer is drawing (${fxPixels} px sampled)`);
await p.waitForTimeout(400);
const s1 = stats(await shot('neon'));
ok(Math.abs(s1.sat - s0.sat) + Math.abs(s1.y - s0.y) > 0.03, `stage visibly changes (sat ${s0.sat.toFixed(2)}→${s1.sat.toFixed(2)}, luma ${s0.y.toFixed(2)}→${s1.y.toFixed(2)})`);

// 2. Monochrome Cinema
await p.locator('[data-look="theme.mono-cinema"]').click(); await p.waitForTimeout(2200);
const s2 = stats(await shot('mono'));
d = await draft();
ok(s2.sat < 0.05 && d.audioClips?.[0]?.ref === 'audio.spy-glass-100@1.0.0' && d.textOverlays.some((t) => t.value === 'FIN.'), `Monochrome Cinema: B&W stage (sat ${s2.sat.toFixed(3)}), Spy Glass, FIN. card`);

// 3. Surprise me + intensity
await p.locator('[data-theme-surprise]').click(); await p.waitForTimeout(1500);
d = await draft();
ok(d.themeId !== 'theme.mono-cinema', `Surprise me → ${d.themeId}`);
await p.locator('[data-theme-intensity]').fill('0.1'); await p.waitForTimeout(800);
d = await draft();
ok(Math.abs((d.themeIntensity ?? -1) - 0.1) < 0.001, `intensity slider persists (${d.themeIntensity})`);
await p.locator('[data-theme-intensity]').fill('1'); await p.waitForTimeout(500);

// 4. Pro override survives a theme change; without Pro the theme wins
await p.evaluate(() => { document.querySelector('.vj-more').open = true; });
await p.locator('.vj-more-menu button:has-text("Show Pro controls")').click(); await p.waitForTimeout(500);
await p.locator('[aria-label="Close panel"]').click().catch(() => {}); await p.waitForTimeout(300);
await p.locator('.vj-grade-tile:has-text("Warm")').first().click(); await p.waitForTimeout(400);
await p.locator('[aria-label="Theme & templates"]').first().click().catch(() => {}); await p.waitForTimeout(400);
await p.locator('[data-look="theme.retro-vhs"]').click(); await p.waitForTimeout(1500);
d = await draft();
ok(d.grade === 'warm' && d.themeId === 'theme.retro-vhs', `Pro-set grade kept across theme change (grade ${d.grade})`);
await p.locator('[aria-label="Close panel"]').click().catch(() => {}); await p.waitForTimeout(300);
await p.locator('.vj-grade-tile').first().click(); await p.waitForTimeout(300);
await p.evaluate(() => { document.querySelector('.vj-more').open = true; });
await p.locator('.vj-more-menu button:has-text("Hide Pro controls")').click(); await p.waitForTimeout(300);

// 5. Save video carries the look (mono → black & white frames + letterbox)
await p.locator('[aria-label="Theme & templates"]').first().click().catch(() => {}); await p.waitForTimeout(300);
await p.locator('[data-look="theme.mono-cinema"]').click(); await p.waitForTimeout(1500);
await p.locator('[aria-label="Close panel"]').click().catch(() => {});
const dl = p.waitForEvent('download', { timeout: 120000 });
await p.locator('[data-save-video]').click(); await p.waitForTimeout(400);
await p.locator('button:has-text("Save video ·")').first().click();
const file = path.join(tmp, 'export' + path.extname((await dl).suggestedFilename()));
await (await dl).saveAs(file);
const frame = path.join(tmp, 'frame.png');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '3', '-i', file, '-frames:v', '1', frame]);
const fs3 = stats(frame);
const top = path.join(tmp, 'top.png');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', frame, '-vf', 'crop=iw:ih*0.04:0:0', top]);
ok(fs3.sat < 0.06 && stats(top).y < 0.08, `saved video has the look (sat ${fs3.sat.toFixed(3)}, letterbox luma ${stats(top).y.toFixed(3)})`);

// 6. Guest page renders the same look
await p.locator('button:has-text("Share")').first().click();
await p.waitForURL(/\/v\//, { timeout: 20000 });
const copyBtn = p.locator('button:has-text("Copy invite link"), button:has-text("Copy link")').first();
await copyBtn.waitFor({ timeout: 20000 });
let link = '';
for (let i = 0; i < 30 && !link.includes('#vj1.'); i++) { await copyBtn.click(); await p.waitForTimeout(700); link = await p.evaluate(() => navigator.clipboard.readText()).catch(() => ''); }
const g = await b.newContext({ viewport: { width: 400, height: 820 }, serviceWorkers: 'block' });
const gp = await g.newPage();
await gp.goto(link); await gp.waitForTimeout(5000);
const gl = await gp.locator('.invite-player-root').getAttribute('data-look').catch(() => null);
const gfx = await gp.locator('.invite-player-root .vj-fx-layer').count();
const gs = path.join(tmp, 'guest.png'); await gp.locator('.preview-stage').first().screenshot({ path: gs });
const gst = stats(gs);
ok(gl === 'theme.mono-cinema' && gfx > 0 && gst.sat < 0.06, `guest page plays the same look (${gl}, fx ${gfx}, sat ${gst.sat.toFixed(3)})`);
await g.close();

ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await b.close();
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
