#!/usr/bin/env node
// Assigns one photo to each story, bound to the story's article URL (not its slide number).
// Order of preference: article photo from an authorised source -> best-matching library photo
// (approved licence, with credit) -> none (build.js draws the placeholder).
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

const used = new Set();
for (const s of stories) {
  if (!s.url) { s.photo = null; s.photo_reason = 'story has no url'; continue; }
  const d = host(s.url);
  if (s.og_image && authorised.some(a => d === a || d.endsWith('.' + a))) {
    s.photo = { kind: 'article', url: s.og_image, attribution: `Photo: ${d}`, licence_basis: 'Written permission on file (config/authorized-sources.json)', article_url: s.url };
    s.photo_reason = 'authorised article photo';
    continue;
  }
  const text = ' ' + [...(s.keywords_en || []), s.title_en || '', new URL(s.url).pathname.replace(/[-_/]+/g, ' ')].join(' ').toLowerCase() + ' ';
  const scored = library.filter(e => !used.has(e.id)).map(e => {
    const w = GENERIC_WEIGHT[e.topic] ?? 1;
    const score = e.keywords.reduce((n, k) => n + (has(text, k) ? w : 0), 0);
    return { e, score, tie: hash(s.url + e.id) };
  }).sort((a, b) => b.score - a.score || (a.tie < b.tie ? -1 : 1));
  let best = scored[0] && scored[0].score > 0 ? scored[0] : scored.find(x => GENERIC.includes(x.e.topic));
  if (!best) { s.photo = null; s.photo_reason = 'library exhausted: placeholder'; continue; }
  used.add(best.e.id);
  const e = best.e;
  s.photo = { kind: 'library', id: e.id, file: e.file, attribution: e.attribution, licence_basis: e.licence_basis, source_url: e.source_url, article_url: s.url };
  s.photo_reason = best.score > 0 ? `matched topic ${e.topic} (score ${best.score})` : `no topic match; generic ${e.topic}`;
}
fs.writeFileSync(file, JSON.stringify(stories, null, 2) + '\n');
for (const [i, s] of stories.entries()) console.log(`${String(i + 1).padStart(2, '0')} ${host(s.url)} -> ${s.photo ? (s.photo.id || s.photo.url) : 'placeholder'} (${s.photo_reason})`);
