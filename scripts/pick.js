#!/usr/bin/env node
// Plans the visual for every story across the whole batch, bound to each story's article URL
// (not its slide number), then assigns it. Visual types:
//   data  - a chart drawn by build.js from the story's own figures (story.chart)
//   photo - an approved library photo (or an article photo from an authorised source)
//   ai    - an AI illustration the run generated (story.ai_image: {url|file}), labelled on the slide
//   none  - the empty placeholder
// Balancing rules: at most 3 AI images per batch, no photo used twice, no two neighbouring
// slides of the same type when another type is available, and a chart beats a generic photo.
// Usage: node scripts/pick.js <stories.json>   (updates the file in place, prints a summary)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/pick.js <stories.json>'); process.exit(2); }
const stories = JSON.parse(fs.readFileSync(file, 'utf8'));
const topics = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'library/queries.json'), 'utf8')).map(q => [q.topic, q.keywords]));
// Matching keywords come from library/queries.json (one place to tune them), falling back to the manifest copy.
const library = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).map(e => ({ ...e, keywords: topics[e.topic] || e.keywords }));
const authorised = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/authorized-sources.json'), 'utf8')).domains || [];
const GENERIC = ['dubai-skyline', 'downtown-dubai', 'business-bay', 'dubai-creek', 'dubai-marina'];
// Specific places and themes beat the catch-all Dubai skyline topic.
const GENERIC_WEIGHT = { 'dubai-skyline': 0.25 };
const esc = k => k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word / whole-phrase match, so "rent" does not match "current".
const has = (text, k) => new RegExp(`(^|[^a-z])${esc(k)}([^a-z]|$)`).test(text);
const hash = s => crypto.createHash('sha1').update(s).digest('hex');
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

const MAX_AI = 3;
const validChart = c => c && ((c.type === 'stat' && c.value) || (c.type === 'compare' && Array.isArray(c.items) && c.items.length >= 2 && c.items.every(i => Number.isFinite(+i.value))) || (c.type === 'share' && Number.isFinite(+c.value) && +c.value > 0 && +c.value < 100));
function bestPhoto(s, used) {
  const text = ' ' + [...(s.keywords_en || []), s.title_en || '', new URL(s.url).pathname.replace(/[-_/]+/g, ' ')].join(' ').toLowerCase() + ' ';
  const scored = library.filter(e => !used.has(e.id)).map(e => {
    const w = GENERIC_WEIGHT[e.topic] ?? 1;
    return { e, score: e.keywords.reduce((n, k) => n + (has(text, k) ? w : 0), 0), tie: hash(s.url + e.id) };
  }).sort((a, b) => b.score - a.score || (a.tie < b.tie ? -1 : 1));
  if (scored[0] && scored[0].score >= 1) return { ...scored[0], specific: true };
  const g = scored.find(x => x.score > 0) || scored.find(x => GENERIC.includes(x.e.topic));
  return g ? { ...g, specific: false } : null;
}

const used = new Set();
let aiCount = 0, prev = null;
const mix = { data: 0, photo: 0, ai: 0, none: 0 };
for (const s of stories) {
  s.photo = null; s.visual = 'none';
  if (!s.url) { s.photo_reason = 'story has no url'; prev = 'none'; mix.none++; continue; }
  const d = host(s.url);
  const authorisedPhoto = s.og_image && authorised.some(a => d === a || d.endsWith('.' + a));
  const bp = authorisedPhoto ? null : bestPhoto(s, used);
  const can = {
    data: validChart(s.chart),
    ai: !!(s.ai_image && (s.ai_image.url || s.ai_image.file)) && aiCount < MAX_AI,
    photo: authorisedPhoto || !!(bp && bp.specific),
    generic: !!bp,
  };
  // Preference: the run's own hint first, then chart, specific photo, AI, generic photo.
  const order = [s.visual_hint, 'data', 'photo', 'ai', 'generic'].filter((t, i, a) => t && a.indexOf(t) === i && can[t]);
  const type = order.find(t => (t === 'generic' ? 'photo' : t) !== prev) || order[0] || 'none';
  if (type === 'data') { s.visual = 'data'; s.photo_reason = 'chart from the article figures'; }
  else if (type === 'ai') {
    aiCount++; s.visual = 'ai';
    s.photo = { kind: 'ai', url: s.ai_image.url || null, file: s.ai_image.file || null, attribution: 'صورة توضيحية مولّدة بالذكاء الاصطناعي', article_url: s.url };
    s.photo_reason = `AI illustration ${aiCount} of max ${MAX_AI}`;
  } else if (type === 'photo' && authorisedPhoto) {
    s.visual = 'photo';
    s.photo = { kind: 'article', url: s.og_image, attribution: `Photo: ${d}`, licence_basis: 'Written permission on file (config/authorized-sources.json)', article_url: s.url };
    s.photo_reason = 'authorised article photo';
  } else if (type === 'photo' || type === 'generic') {
    const e = bp.e; used.add(e.id); s.visual = 'photo';
    s.photo = { kind: 'library', id: e.id, file: e.file, attribution: e.attribution, licence_basis: e.licence_basis, source_url: e.source_url, article_url: s.url };
    s.photo_reason = bp.specific ? `matched topic ${e.topic} (score ${bp.score})` : `generic ${e.topic}`;
  } else s.photo_reason = 'no chart, photo or AI image available: placeholder';
  mix[s.visual]++; prev = s.visual;
}
fs.writeFileSync(file, JSON.stringify(stories, null, 2) + '\n');
for (const [i, s] of stories.entries()) console.log(`${String(i + 1).padStart(2, '0')} ${host(s.url)} -> ${s.visual}${s.photo ? ' ' + (s.photo.id || s.photo.url || s.photo.file) : ''} (${s.photo_reason})`);
console.log(`MIX data=${mix.data} photo=${mix.photo} ai=${mix.ai} placeholder=${mix.none}`);
