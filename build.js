#!/usr/bin/env node
// Renders one 1080x1350 Story PNG per story with the pre-installed Playwright Chromium.
// Usage: node build.js <stories.json> <outDir>
// Each story: { url, domain, title, bullets[], photo? }  (photo is set by scripts/pick.js)
// A photo that cannot be loaded never stops the batch: that slide gets the placeholder.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const ROOT = __dirname;
const RAW_BASE = process.env.RAW_BASE || 'https://raw.githubusercontent.com/kalredha/daily-carousel-images/main/';
const [storiesFile, outDir] = process.argv.slice(2);
if (!storiesFile || !outDir) { console.error('usage: node build.js <stories.json> <outDir>'); process.exit(2); }
const stories = JSON.parse(fs.readFileSync(storiesFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

// Almarai 700/800, Arabic + Latin subsets, inlined as base64 (no CDN needed).
const fontDir = path.join(ROOT, 'node_modules/@fontsource/almarai');
const fontCss = ['700', '800'].map(w => fs.readFileSync(path.join(fontDir, `${w}.css`), 'utf8')
  .replace(/url\(\.\/files\/([^)]+)\)/g, (_, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(fontDir, 'files', f)).toString('base64')})`)).join('\n');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Signed percentages: green for +, red for - / −, always shown with their sign, LTR.
const colour = s => esc(s).replace(/([+\-−]\s?\d+(?:[.,]\d+)?\s?%)/g, m => `<span class="${m.trim()[0] === '+' ? 'up' : 'dn'}" dir="ltr">${m.replace('-', '−').replace(/\s/g, '')}</span>`);
const slug = (s, i) => (s.slug || (() => { try { return new URL(s.url).pathname.split('/').filter(Boolean).pop(); } catch { return ''; } })() || `story-${i + 1}`)
  .toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || `story-${i + 1}`;

async function loadPhoto(p) {
  if (!p) return null;
  let buf;
  if (p.file && fs.existsSync(path.join(ROOT, p.file))) buf = fs.readFileSync(path.join(ROOT, p.file));
  else {
    const url = p.file ? RAW_BASE + p.file : p.url;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  const mime = buf[0] === 0x89 ? 'image/png' : buf[0] === 0x52 ? 'image/webp' : 'image/jpeg';
  return { dataUri: `data:${mime};base64,${buf.toString('base64')}`, sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}

// Charts drawn from the story's own figures. Themes alternate dark/light across a batch.
const num = v => String(v).replace('-', '−');
const sign = v => /^\s*\+/.test(String(v)) ? 'pos' : /^\s*[-−]/.test(String(v)) ? 'neg' : 'flat';
function chartHtml(c, dark) {
  if (!c) return '';
  if (c.type === 'stat') {
    return `<div class="ch stat ${dark ? 'dk' : 'lt'}"><div class="big ${sign(c.value)}" dir="ltr">${esc(num(c.value))}</div>
      <div class="lab">${esc(c.label)}</div>${c.sub ? `<div class="sub">${esc(c.sub)}</div>` : ''}</div>`;
  }
  if (c.type === 'compare') {
    const max = Math.max(...c.items.map(i => Math.abs(+i.value))) || 1;
    return `<div class="ch cmp ${dark ? 'dk' : 'lt'}"><div class="lab">${esc(c.label)}</div><div class="bars">${c.items.map((i, k) => `
      <div class="row"><div class="nm">${esc(i.name)}</div><div class="track"><div class="bar b${k % 3}" style="width:${Math.max(6, Math.round(Math.abs(+i.value) / max * 100))}%"></div></div>
      <div class="val" dir="ltr">${esc(i.display || i.value)}</div></div>`).join('')}</div>${c.unit ? `<div class="sub">${esc(c.unit)}</div>` : ''}</div>`;
  }
  if (c.type === 'share') {
    const v = Math.max(1, Math.min(99, +c.value));
    return `<div class="ch shr ${dark ? 'dk' : 'lt'}"><div class="big flat" dir="ltr">${v}%</div><div class="lab">${esc(c.label)}</div>
      <div class="split"><div class="part a" style="width:${v}%"><span>${esc(c.part_label || '')}</span></div><div class="part b" style="width:${100 - v}%"><span>${esc(c.rest_label || '')}</span></div></div></div>`;
  }
  return '';
}

const html = (s, img, scale, dark) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${fontCss}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;background:#F3ECE0;font-family:Almarai,sans-serif;color:#2A2420}
.frame{position:absolute;inset:34px;border:3px solid #8A6A2F;pointer-events:none}
.page{position:absolute;inset:34px;padding:46px 48px 40px;display:flex;flex-direction:column;align-items:center}
.photo{width:908px;height:500px;flex:none;border:3px solid #8A6A2F;border-radius:14px;overflow:hidden;background:#ECE2D1}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.ch{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:34px 56px;text-align:center}
.ch.dk{background:#2A2420;color:#F3ECE0}.ch.lt{background:#FBF7F0;color:#2A2420}
.ch .big{font-weight:800;font-size:150px;line-height:1.05;letter-spacing:-2px}
.ch.dk .big.pos{color:#7BD3A0}.ch.dk .big.neg{color:#F08A80}.ch.dk .big.flat{color:#D4B47A}
.ch.lt .big.pos{color:#2E7D4F}.ch.lt .big.neg{color:#B23A3A}.ch.lt .big.flat{color:#8A6A2F}
.ch .lab{font-weight:800;font-size:34px;line-height:1.35;margin-top:14px;max-width:780px}
.ch .sub{font-weight:700;font-size:24px;margin-top:12px;opacity:.75}
.ch.dk .lab{color:#F3ECE0}.ch.lt .lab{color:#2A2420}
.cmp .bars{width:100%;margin-top:30px;display:flex;flex-direction:column;gap:22px}
.cmp .row{display:flex;align-items:center;gap:18px}
.cmp .nm{flex:none;width:210px;font-weight:700;font-size:26px;text-align:right}
.cmp .track{flex:1;height:54px;border-radius:10px;overflow:hidden;background:rgba(138,106,47,.15);display:flex;justify-content:flex-start}
.cmp .bar{height:100%;border-radius:10px}.cmp .b0{background:#8A6A2F}.cmp .b1{background:#D4B47A}.cmp .b2{background:#6E6257}
.cmp .val{flex:none;width:170px;font-weight:800;font-size:30px;text-align:left}
.shr .split{width:100%;height:70px;margin-top:30px;display:flex;border-radius:12px;overflow:hidden}
.shr .part{display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;white-space:nowrap;overflow:hidden}
.shr .part.a{background:#8A6A2F;color:#F3ECE0}.shr .part.b{background:#D9CBB4;color:#2A2420}
.credit{flex:none;margin-top:8px;font-weight:700;font-size:17px;color:#6E6257;text-align:center;max-width:908px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.body{flex:1;width:100%;display:flex;flex-direction:column;align-items:center;padding-top:${Math.round(30 * scale)}px;min-height:0}
h1{font-weight:800;font-size:${Math.round(54 * scale)}px;line-height:1.3;text-align:center;max-width:900px}
ul{list-style:none;margin-top:${Math.round(26 * scale)}px;width:100%;padding:0 10px}
li{font-weight:700;font-size:${Math.round(34 * scale)}px;line-height:1.5;margin-bottom:${Math.round(12 * scale)}px}
li::before{content:"– ";color:#8A6A2F}
.up{color:#2E7D4F}.dn{color:#B23A3A}
.up,.dn{display:inline-block;direction:ltr;unicode-bidi:isolate}
.foot{flex:none;display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:10px}
.src{font-weight:700;font-size:26px;color:#6E6257;direction:ltr}
.pill{font-weight:800;font-size:28px;color:#F3ECE0;background:#8A6A2F;border-radius:999px;padding:10px 40px;direction:ltr}
</style></head><body><div class="frame"></div><div class="page">
<div class="photo" id="photo">${s.visual === 'data' ? chartHtml(s.chart, dark) : img ? `<img id="img" src="${img.dataUri}">` : ''}</div>
${s.visual !== 'data' && img && s.photo?.attribution ? `<div class="credit" dir="auto">${esc(s.photo.attribution)}</div>` : ''}
<div class="body" id="body"><h1>${esc(s.title)}</h1><ul>${(s.bullets || []).map(b => `<li>${colour(b)}</li>`).join('')}</ul></div>
<div class="foot" id="foot"><div class="src">${esc(s.domain)}</div><div class="pill">@khaled.estates</div></div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const report = [];
  let dataIdx = 0;
  for (const [i, s] of stories.entries()) {
    if (!s.visual) s.visual = s.photo ? 'photo' : 'none';
    const name = `${String(i + 1).padStart(2, '0')}-${slug(s, i)}.png`;
    let img = null, photoError = null;
    if (s.visual !== 'data') { try { img = await loadPhoto(s.photo); } catch (e) { photoError = e.message; } }
    // An AI image or photo that cannot be downloaded falls back to the story's chart, if it has one.
    if (s.visual !== 'data' && !img && s.chart) { s.fallback_from = s.visual; s.visual = 'data'; }
    const dark = s.visual === 'data' ? (dataIdx++ % 2 === 0) : false;
    let scale = 1, fits = false;
    for (; scale >= 0.7; scale = +(scale - 0.05).toFixed(2)) {
      await page.setContent(html(s, img, scale, dark), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      fits = await page.evaluate(() => { const b = document.getElementById('body'); return b.scrollHeight <= b.clientHeight + 1; });
      if (fits) break;
    }
    if (s.visual === 'data') fits = fits && await page.evaluate(() => { const c = document.querySelector('.ch'); return !!c && c.scrollHeight <= c.clientHeight + 1; });
    const loaded = img ? await page.evaluate(() => { const i = document.getElementById('img'); return !!i && i.complete && i.naturalWidth > 0; }) : false;
    await page.screenshot({ path: path.join(outDir, name), clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    report.push({ slide: i + 1, png: name, article_url: s.url, photo: img && loaded ? { id: s.photo.id || null, file: s.photo.file || null, url: s.photo.url || null, sha256: img.sha256, bytes: img.bytes, attribution: s.photo.attribution } : null,
      visual: s.visual === 'data' ? 'data' : (img && loaded ? s.visual : 'placeholder'), fallback_from: s.fallback_from || null, chart: s.visual === 'data' ? s.chart.type : null,
      placeholder: s.visual !== 'data' && !(img && loaded), photo_error: photoError, fits, font_scale: scale });
    const shown = s.visual === 'data' ? `chart:${s.chart.type}` : img && loaded ? `${s.visual}:${s.photo.id || s.photo.url || s.photo.file}` : 'placeholder' + (photoError ? ` (${photoError})` : '');
    console.log(`${name}  visual=${shown}  fits=${fits} scale=${scale}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
})().catch(e => { console.error(e); process.exit(1); });
