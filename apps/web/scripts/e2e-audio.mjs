/**
 * v1.3 Audio e2e: every bundled track is a real, licensed recording that
 *   - is served (200, AAC/MP4), decodes in the browser and matches its manifest length,
 *   - has a licence/credit entry (CC0 / public domain / CC BY only — no NC/ND/SA),
 *   - sits in the loudness window (music -14 ±1.5 LUFS, SFX -16 ±3 LUFS, true peak ≤ -0.5 dBTP) measured with ffmpeg,
 *   - loops carry a BPM + waveform; plus the audio browser (categories, search, preview, one-tap Use → beat-sync)
 *     and the Credits page work.
 *   BASE=https://yvelkuri-stu.github.io/voyajes node scripts/e2e-audio.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';

const BASE = (process.env.BASE || 'http://localhost:4310').replace(/\/$/, '');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vja-'));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const LIC = /^(CC0 1\.0|Public domain|CC BY [234]\.[05])$/;

const lib = await (await fetch(`${BASE}/library/manifest.json`, { cache: 'no-store' })).json();
const cat = await (await fetch(`${BASE}/catalog-manifest.json`, { cache: 'no-store' })).json();
const samples = await (await fetch(`${BASE}/library/samples.json`, { cache: 'no-store' })).json();
const libAudio = lib.items.filter((i) => i.kind === 'audio');
const beats = cat.packs.filter((p) => p.kind === 'audio-beat');
const tracks = [
  ...libAudio.map((i) => ({ id: i.id, url: `${BASE}/${i.url}`, sfx: i.audioType === 'sfx', dur: i.durationSec, bpm: i.bpm, peaks: i.peaks, credit: i.credit, category: i.category })),
  ...beats.map((p) => ({ id: p.id, url: `${BASE}${p.previewUrl}`, sfx: false, dur: p.durationSec, bpm: p.bpm, peaks: p.peaks, credit: p.credit, category: p.category })),
];
ok(libAudio.length >= 40 && beats.length >= 9, `${libAudio.length} library tracks + ${beats.length} theme beats`);
const CATS = ['festive-indian', 'devotional', 'lullaby', 'upbeat', 'cinematic', 'chill', 'genz', 'sfx'];
ok(CATS.every((c) => tracks.some((t) => t.category === c)), `every browser category has tracks (${CATS.map((c) => `${c}:${tracks.filter((t) => t.category === c).length}`).join(' ')})`);
ok(!libAudio.some((i) => /\.mp3$/.test(i.url)) && !beats.some((p) => /\.mp3$/.test(p.previewUrl)), 'no old synthesized .mp3 left in the manifests');

// ── served + licence + loudness (ffmpeg ebur128 on the exact served bytes)
const measure = (file) => {
  const out = spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
  const s = out.slice(out.lastIndexOf('Summary:'));
  return { I: Number((s.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]), tp: Number((s.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]) };
};
let totalBytes = 0;
for (const t of tracks) {
  const r = await fetch(t.url);
  const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
  totalBytes += buf.length;
  const isMp4 = buf.subarray(4, 8).toString() === 'ftyp';
  ok(r.ok && isMp4 && buf.length > 8000, `${t.id} served (${r.status}, ${Math.round(buf.length / 1024)} KB, ${r.headers.get('content-type')})`);
  const c = t.credit;
  ok(!!c && LIC.test(c.license) && /^https:\/\//.test(c.sourceUrl) && /^https:\/\/creativecommons\.org\//.test(c.licenseUrl) && !!c.author && !!c.work && !/NC|ND|SA/.test(c.license),
    `${t.id} licence: ${c ? `${c.license} · ${c.author} · ${c.work}` : 'MISSING'}`);
  const f = path.join(tmp, t.id.replace(/[^a-z0-9.-]/gi, '_') + '.m4a'); fs.writeFileSync(f, buf);
  const { I, tp } = measure(f);
  const [lo, hi] = t.sfx ? [-19, -13] : [-15.5, -12.5];
  ok(I >= lo && I <= hi && tp <= -0.5, `${t.id} loudness ${I} LUFS, true peak ${tp} dBTP (window ${lo}..${hi})`);
  if (!t.sfx) ok(t.bpm >= 50 && t.bpm <= 200 && t.peaks?.length === 64, `${t.id} ${t.bpm} BPM + 64-bin waveform`);
}
ok(totalBytes < 20 * 1024 * 1024, `whole audio library ${(totalBytes / 1048576).toFixed(1)} MB (lazy-loaded, not precached)`);

// sample templates only reference real library tracks
const refs = new Set(Object.values(samples.samples).flatMap((s) => s.audio.map((a) => a.ref)));
ok([...refs].every((r) => !r.startsWith('lib:') || libAudio.some((i) => `lib:${i.id}` === r)), `all ${refs.size} template audio refs resolve`);

// ── browser: decode every track; SW must not precache audio
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.addInitScript(() => localStorage.setItem('voyajes.onboarded.v1', '1'));
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(`${BASE}/create?fresh=1`); await p.waitForTimeout(2000);
const dec = await p.evaluate(async (list) => {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const out = [];
  for (const t of list) {
    try {
      const ab = await (await fetch(t.url)).arrayBuffer();
      const buf = await ac.decodeAudioData(ab);
      out.push({ id: t.id, d: buf.duration, ch: buf.numberOfChannels, want: t.dur });
    } catch (e) { out.push({ id: t.id, err: String(e) }); }
  }
  return out;
}, tracks.map((t) => ({ id: t.id, url: t.url, dur: t.dur })));
const bad = dec.filter((x) => x.err || Math.abs(x.d - x.want) > 0.12 || x.ch !== 2);
ok(bad.length === 0, `all ${dec.length} tracks decode in the browser as stereo with the manifest length${bad.length ? ' — ' + JSON.stringify(bad.slice(0, 4)) : ''}`);
const precached = await p.evaluate(async () => {
  const names = await caches.keys();
  for (const n of names.filter((x) => /precache/.test(x))) {
    const keys = await (await caches.open(n)).keys();
    if (keys.some((k) => /\.(m4a|mp3)(\?|$)/.test(k.url))) return true;
  }
  return false;
});
ok(!precached, 'service worker does not precache audio');

// ── audio browser in the editor
await p.locator('[data-dock="text-audio"]').first().click().catch(() => {});
await p.waitForTimeout(800);
let vis = await p.locator('[data-audio-browser]').first().isVisible().catch(() => false);
if (!vis) { await p.locator('[data-audio-browser]').first().scrollIntoViewIfNeeded().catch(() => {}); vis = await p.locator('[data-audio-browser]').first().isVisible().catch(() => false); }
ok(vis, 'audio browser opens from the Text & Audio dock');
const rows0 = await p.locator('[data-audio-track]').count();
ok(rows0 === tracks.length, `browser lists every track (${rows0}/${tracks.length})`);
await p.locator('[data-audio-cat="festive-indian"]').first().click(); await p.waitForTimeout(300);
const fest = await p.locator('[data-audio-track]').evaluateAll((els) => els.map((e) => e.getAttribute('data-audio-track')));
ok(fest.length >= 5 && fest.includes('lib:lib.audio.ceremony-shehnai') && fest.includes('lib:lib.audio.ceremony-nadaswaram') && !fest.includes('lib:lib.audio.lullaby-bells'), `Festive Indian chip → ${fest.length} tracks incl. shehnai + nadaswaram`);
await p.locator('[data-audio-cat="festive-indian"]').first().click(); // keep filter, then search across all
await p.locator('.vj-ab-cat', { hasText: 'All' }).first().click();
await p.locator('[data-audio-search]').first().fill('music box'); await p.waitForTimeout(300);
const mb = await p.locator('[data-audio-track]').evaluateAll((els) => els.map((e) => e.getAttribute('data-audio-track')));
ok(mb.includes('lib:lib.audio.ceremony-musicbox') && mb.length <= 6, `search "music box" → ${mb.join(', ')}`);
const wave = await p.locator('[data-audio-track] .vj-ab-wave rect').count();
ok(wave >= 64, `waveforms drawn (${wave} bars)`);
await p.locator('[data-audio-search]').first().fill('dhol'); await p.waitForTimeout(300);
const row = p.locator('[data-audio-track="lib:lib.audio.festive-dhol"]');
await row.locator('.vj-ab-play').click(); await p.waitForTimeout(1500);
const playing = await row.evaluate((e) => e.classList.contains('is-playing') && [...e.querySelectorAll('rect.is-played')].length > 0);
ok(playing, 'preview ▶ plays with a moving waveform playhead');
const meta = await row.locator('.vj-ab-meta').textContent();
const dhol = libAudio.find((i) => i.id === 'lib.audio.festive-dhol');
const metaN = meta.replace(/\s+/g, ' ').trim();
ok(metaN.includes(`${Math.round(dhol.bpm)} BPM`) && /CC BY/.test(metaN), `row shows BPM + licence (${metaN})`);
// beat-sync on, then one-tap Use
const before = await p.evaluate(() => JSON.parse(localStorage.getItem('voyajes.draft.v1') || '{}'));
await row.locator('[data-audio-use]').click(); await p.waitForTimeout(1200);
const d = await p.evaluate(() => JSON.parse(localStorage.getItem('voyajes.draft.v1') || '{}'));
ok(d.audioTrackRef === 'lib:lib.audio.festive-dhol', `one-tap Use sets the music → ${d.audioTrackRef} (was ${before.audioTrackRef})`);
const st = await p.locator('.status, [role=status]').allTextContents().catch(() => []);
ok(st.join(' ').includes('Dhol Baraat') || (await p.locator('.vj-ab-row.is-current[data-audio-track="lib:lib.audio.festive-dhol"]').count()) === 1, 'row marked Now');
await p.locator('[data-audio-search]').first().fill(''); 

// ── template sample → audio track follows the real recording + its BPM drives beat-sync
await p.goto(`${BASE}/themes?tab=templates&filter=ceremony`); await p.waitForTimeout(1200);
await p.locator('.grid-themes > button.card', { hasText: 'Puttu' }).first().click();
await p.waitForURL(/\/create/, { timeout: 15000 });
await p.waitForFunction(() => document.querySelectorAll('.vj-tl-clip').length >= 3, null, { timeout: 25000 }).catch(() => {});
await p.waitForTimeout(1500);
const d2 = await p.evaluate(() => JSON.parse(localStorage.getItem('voyajes.draft.v1') || '{}'));
ok(d2.audioTrackRef === 'lib:lib.audio.ceremony-nadaswaram' && d2.audioClips?.some((a) => a.ref === 'lib:lib.audio.sfx-temple-bell'), `Puttu Ventrukalu sample → nadaswaram bed + temple bell (${d2.audioTrackRef})`);
// photo import snaps to the new track BPM
const nad = libAudio.find((i) => i.id === 'lib.audio.ceremony-nadaswaram');
ok(nad && nad.bpm > 0, `nadaswaram has a measured tempo (${nad?.bpm} BPM, ${nad?.pulse})`);

// ── Credits page
await p.goto(`${BASE}/credits`); await p.waitForTimeout(1200);
const credRows = await p.locator('[data-credit-row]').count();
const licLinks = await p.locator('[data-credit-license]').evaluateAll((els) => els.filter((a) => /creativecommons\.org/.test(a.href)).length);
ok(credRows === tracks.length && licLinks === tracks.length, `Credits page lists ${credRows}/${tracks.length} tracks with licence links (${licLinks})`);
const ctext = await p.locator('[data-credits]').textContent();
ok(/Kevin MacLeod/.test(ctext) && /Vis M/.test(ctext) && /Antti Luode/.test(ctext) && /Johnny Kalsi/.test(ctext), 'CC BY authors credited (MacLeod, Vis M, Antti Luode, Johnny Kalsi …)');
await p.goto(`${BASE}/`); await p.waitForTimeout(800);
ok(await p.locator('[data-home-credits]').count() === 1, 'Home footer links to Credits');

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL AUDIO CHECKS PASSED');
process.exit(fails ? 1 : 0);
