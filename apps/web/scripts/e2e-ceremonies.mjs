/**
 * v1.2 Ceremonies e2e: the 4 head-tonsure invitation templates are listed under
 * Themes → 🪔 Ceremonies with image preview cards, and each one opens as a COMPLETE
 * playable sample (own art, own audio, Indic-script text in Noto fonts, event fields,
 * transitions). One is shared end-to-end.
 *
 *   BASE=https://yvelkuri-stu.github.io/voyajes node scripts/e2e-ceremonies.mjs
 */
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:4310';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const CER = [
  { id: 'template.mundan-sanskar', name: 'Mundan', script: /[\u0900-\u097F]/, font: 'Noto Sans Devanagari', audio: 'ceremony-shehnai', event: /Mundan/ },
  { id: 'template.puttu-ventrukalu', name: 'Puttu', script: /[\u0C00-\u0C7F]/, font: 'Noto Sans Telugu', audio: 'ceremony-nadaswaram', event: /Puttu|Ventrukalu/ },
  { id: 'template.mottai-kaathu-kuthu', name: 'Mottai', script: /[\u0B80-\u0BFF]/, font: 'Noto Sans Tamil', audio: 'ceremony-nadaswaram-bright', event: /Mottai|Kaathu/ },
  { id: 'template.first-haircut', name: 'First Haircut', script: /First|Haircut|little/i, font: null, audio: 'ceremony-musicbox', event: /Haircut/ },
];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));

// ── catalog + assets
const samples = await (await fetch(`${BASE}/library/samples.json`, { cache: 'no-store' })).json();
const lib = await (await fetch(`${BASE}/library/manifest.json`, { cache: 'no-store' })).json();
const cat = await (await fetch(`${BASE}/catalog-manifest.json`, { cache: 'no-store' })).json();
for (const c of CER) {
  const pack = cat.packs.find((x) => x.id === c.id);
  ok(!!pack && pack.mode === 'invitation' && pack.category === 'ceremonies' && pack.tags.includes('ceremony'), `${c.id} in catalog as a ceremony invitation`);
  const beatOk = cat.packs.some((x) => x.id === pack?.beatId);
  ok(beatOk, `${c.id} beat ${pack?.beatId} exists`);
  const s = samples.samples[c.id];
  ok(!!s && s.clips.length >= 3 && s.audio.some((a) => a.ref.includes(c.audio)) && s.text.length >= 4, `${c.id} sample: ${s?.clips.length} clips, own audio ${c.audio}, ${s?.text.length} text layers`);
  ok(['{eventName}', '{eventWhen}', '{eventWhere}', '{hostName}'].every((t) => JSON.stringify(s?.text).includes(t)), `${c.id} text uses event fields (child/event, date+time, venue, family)`);
  ok(s?.clips.some((x) => x.transitionOut), `${c.id} has transitions`);
  for (const m of s?.clips ?? []) {
    const it = lib.items.find((x) => x.id === m.media);
    const r = it && (await fetch(`${BASE}/${it.url}`));
    const r2 = it?.thumbnail && (await fetch(`${BASE}/${it.thumbnail}`));
    ok(!!r && r.ok && /image/.test(r.headers.get('content-type') || '') && (!r2 || r2.ok), `${m.media} art + thumb served`);
  }
  const au = lib.items.find((x) => x.id === `lib.audio.${c.audio}`);
  const ar = au && (await fetch(`${BASE}/${au.url}`));
  const buf = ar && ar.ok ? Buffer.from(await ar.arrayBuffer()) : Buffer.alloc(0);
  ok(buf.length > 20000 && (buf.subarray(0, 3).toString() === 'ID3' || buf[0] === 0xff), `${c.audio} audio served (${buf.length} B mp3)`);
}

// ── Themes → Ceremonies chip → preview cards
await p.goto(`${BASE}/themes?tab=templates`); await p.waitForTimeout(1500);
await p.locator('[data-filter-ceremony]').click(); await p.waitForTimeout(1500);
ok(/filter=ceremony/.test(p.url()), 'Ceremonies chip filters the Templates list');
const cards = await p.evaluate(() => [...document.querySelectorAll('.grid-themes > button.card')].map((c) => ({ t: c.textContent, img: [...c.querySelectorAll('img')].some((i) => i.complete && i.naturalWidth > 0) })));
ok(cards.length === 4, `4 ceremony cards (${cards.length})`);
ok(cards.every((c) => c.img), 'every ceremony card shows an image preview');

for (const c of CER) {
  await p.goto(`${BASE}/themes?tab=templates&filter=ceremony`); await p.waitForTimeout(1200);
  await p.locator('.grid-themes > button.card', { hasText: c.name }).first().click();
  await p.waitForURL(/\/create/, { timeout: 15000 });
  await p.waitForFunction(() => document.querySelectorAll('.vj-tl-clip').length >= 3, null, { timeout: 25000 }).catch(() => {});
  const clips = await p.locator('.vj-tl-clip').count();
  const audio = await p.locator('.vj-tl-audio').count();
  ok(clips >= 3 && audio >= 1, `${c.name}: sample loaded from the card (${clips} clips, ${audio} audio)`);
  const title = await p.locator('.compose-title-input').inputValue();
  ok(c.event.test(title), `${c.name}: invitation defaults filled ("${title}")`);
  await p.locator('button.btn-play').click(); await p.waitForTimeout(1600);
  const st = await p.evaluate(async (font) => {
    const ov = [...document.querySelectorAll('.preview-overlay')].map((o) => o.textContent);
    const img = [...document.querySelectorAll('.preview-stage img')].some((i) => i.naturalWidth > 0);
    let fontOk = true;
    if (font) { await document.fonts.ready; const el = document.querySelector('.preview-overlay'); fontOk = !!el && getComputedStyle(el).fontFamily.includes(font) && document.fonts.check(`20px "${font}"`, (el.textContent || '').replace(/[\x00-\x7F]/g, '')); }
    return { ov, img, fontOk, t: document.querySelector('.compose-root')?.textContent?.match(/\d:\d\d \/ \d:\d\d/)?.[0] };
  }, c.font);
  ok(st.img, `${c.name}: preview shows the template art while playing`);
  ok(st.ov.some((x) => c.script.test(x)), `${c.name}: native-script text on screen (${st.ov.join(' | ').slice(0, 80)})`);
  ok(st.fontOk, `${c.name}: ${c.font ?? 'display'} font in use`);
  await p.locator('button.btn-play').click().catch(() => {});
  await p.screenshot({ path: `/tmp/vj-cer-${c.id.slice(9)}.png` });
}

// ── share one end-to-end (portable link → guest player)
await p.locator('[data-primary-share]').click();
await p.waitForURL(/\/(v|share)/, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2500);
ok(/Haircut/i.test(await p.locator('body').innerText()), `First Haircut shares (${p.url().slice(0, 80)}…)`);
ok(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' / ')})`);
console.log('FAILS', fails);
await b.close();
process.exit(fails ? 1 : 0);
