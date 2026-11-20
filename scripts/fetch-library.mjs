// Builds/refreshes the approved photo library from Wikimedia Commons.
// Runs in GitHub Actions (open internet). Keeps only CC0, public domain and CC BY
// licences (no share-alike, no non-commercial, no restriction flags), landscape, >= 1600px wide.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PER_TOPIC = 3;
const UA = 'daily-carousel-images-bot/1.0 (GitHub Actions; photo library refresh)';
const queries = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/queries.json'), 'utf8'));
const manifestPath = path.join(ROOT, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const have = new Set(manifest.map(e => e.id));

const strip = s => (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const okLicence = l => /^(cc0|public domain|pd\b|cc by \d(\.\d)?|cc by \d(\.\d)? [a-z]+|cc-by-\d)/i.test(l) && !/sa|nc|nd/i.test(l.replace(/^public domain/i, ''));

async function api(params) {
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', origin: '*', ...params });
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Commons API ${r.status}`);
  return r.json();
}

let added = 0;
for (const q of queries) {
  const count = manifest.filter(e => e.topic === q.topic).length;
  if (count >= PER_TOPIC) continue;
  let data;
  try {
    data = await api({ action: 'query', generator: 'search', gsrsearch: `${q.query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '40',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600' });
  } catch (e) { console.log(`skip ${q.topic}: ${e.message}`); continue; }
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => a.index - b.index);
  let need = PER_TOPIC - count;
  for (const p of pages) {
    if (need <= 0) break;
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const id = `commons-${p.pageid}`; if (have.has(id)) continue;
    const md = ii.extmetadata || {};
    const lic = strip(md.LicenseShortName?.value);
    if (!okLicence(lic)) continue;
    if (strip(md.Restrictions?.value)) continue;
    if (ii.mime !== 'image/jpeg' || ii.width < 1600 || ii.width / ii.height < 1.3) continue;
    const r = await fetch(ii.thumburl, { headers: { 'User-Agent': UA } });
    if (!r.ok) continue;
    const buf = Buffer.from(await r.arrayBuffer());
    const file = `images/library/${id}.jpg`;
    fs.writeFileSync(path.join(ROOT, file), buf);
    const author = strip(md.Artist?.value) || 'Unknown author';
    manifest.push({
      id, topic: q.topic, keywords: q.keywords, file,
      title: p.title.replace(/^File:/, ''),
      source_url: ii.descriptionurl, licence_basis: lic,
      licence_url: strip(md.LicenseUrl?.value) || null,
      author, attribution: `${author} / ${lic} / Wikimedia Commons`,
      date_added: new Date().toISOString().slice(0, 10),
    });
    have.add(id); need--; added++;
    console.log(`+ ${q.topic}: ${id} (${lic})`);
  }
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const rows = manifest.map(e => `| ${e.file} | [${e.title.replace(/\|/g, '/')}](${e.source_url}) | ${e.licence_basis}${e.licence_url ? ` ([terms](${e.licence_url}))` : ''} | ${e.attribution.replace(/\|/g, '/')} |`);
fs.writeFileSync(path.join(ROOT, 'LICENSES.md'),
  '# Image licences\n\nEvery image in `images/` has a row here. Library photos come from Wikimedia Commons and are limited to CC0, public domain and CC BY licences.\n\n' +
  '| Image file | Image source | Licence or permission basis | Attribution text |\n|---|---|---|---|\n' + rows.join('\n') + '\n');
console.log(`added ${added}, total ${manifest.length}`);
