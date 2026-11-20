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

const html = (s, img, scale) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${fontCss}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;background:#F3ECE0;font-family:Almarai,sans-serif;color:#2A2420}
.frame{position:absolute;inset:34px;border:3px solid #8A6A2F;pointer-events:none}
.page{position:absolute;inset:34px;padding:46px 48px 40px;display:flex;flex-direction:column;align-items:center}
.photo{width:908px;height:500px;flex:none;border:3px solid #8A6A2F;border-radius:14px;overflow:hidden;background:#ECE2D1}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.credit{flex:none;margin-top:8px;font-weight:700;font-size:17px;color:#6E6257;direction:ltr;text-align:center;max-width:908px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
<div class="photo" id="photo">${img ? `<img id="img" src="${img.dataUri}">` : ''}</div>
${img && s.photo?.attribution ? `<div class="credit">${esc(s.photo.attribution)}</div>` : ''}
<div class="body" id="body"><h1>${esc(s.title)}</h1><ul>${(s.bullets || []).map(b => `<li>${colour(b)}</li>`).join('')}</ul></div>
<div class="foot" id="foot"><div class="src">${esc(s.domain)}</div><div class="pill">@khaled.estates</div></div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const report = [];
  for (const [i, s] of stories.entries()) {
    const name = `${String(i + 1).padStart(2, '0')}-${slug(s, i)}.png`;
    let img = null, photoError = null;
    try { img = await loadPhoto(s.photo); } catch (e) { photoError = e.message; }
    let scale = 1, fits = false;
    for (; scale >= 0.7; scale = +(scale - 0.05).toFixed(2)) {
      await page.setContent(html(s, img, scale), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      fits = await page.evaluate(() => { const b = document.getElementById('body'); return b.scrollHeight <= b.clientHeight + 1; });
      if (fits) break;
    }
    const loaded = img ? await page.evaluate(() => { const i = document.getElementById('img'); return !!i && i.complete && i.naturalWidth > 0; }) : false;
    await page.screenshot({ path: path.join(outDir, name), clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    report.push({ slide: i + 1, png: name, article_url: s.url, photo: img && loaded ? { id: s.photo.id || null, file: s.photo.file || null, url: s.photo.url || null, sha256: img.sha256, bytes: img.bytes, attribution: s.photo.attribution } : null,
      placeholder: !(img && loaded), photo_error: photoError, fits, font_scale: scale });
    console.log(`${name}  photo=${img && loaded ? (s.photo.id || s.photo.url) : 'placeholder' + (photoError ? ` (${photoError})` : '')}  fits=${fits} scale=${scale}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
})().catch(e => { console.error(e); process.exit(1); });
