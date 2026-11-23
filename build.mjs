#!/usr/bin/env node
// Builds the site into dist/. Zero dependencies: plain Node (22+).
//
//   src/pages/*.html     one file per page; first line is <!--page {json} -->
//   src/partials/*.html  pulled in with {{> name}}
//   src/static/          copied as-is (assets, _headers, robots.txt, .well-known)
//   site.config.json     every fact about the shop; values are HTML-escaped here
//
// {{name}} inserts a value from `vars` below. An unknown name stops the build,
// so a typo can never ship as literal braces.

import { readFile, writeFile, mkdir, readdir, rm, cp, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const SRC = join(root, 'src');
const DIST = join(root, 'dist');
const args = new Set(process.argv.slice(2));

const config = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
// `--no-preview` builds the launch version (indexable, no sample strip) for checks.
const preview = config.preview.enabled && !args.has('--no-preview');

// ---------- helpers ----------

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Wraps a stand-in value so the page shows it as a placeholder. */
const ph = (html, isPlaceholder) =>
  isPlaceholder ? `<span class="ph" title="Placeholder: set this in site.config.json">${html}</span>` : html;

const httpsUrl = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; }
};

const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
};

const JS_DAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------- values from the config ----------

const a = config.address;
const addrPh = a.placeholder;
const addressText = `${a.street}, ${a.city}, ${a.region} ${a.postalCode}`;
const mapQuery = addrPh ? `${config.name} thrift store` : (a.directionsQuery || `${config.name}, ${addressText}`);
const directionsUrl = addrPh
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}`;
const mapEmbed = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;

const tz = config.timezone.value;
try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { throw new Error(`timezone "${tz}" is not a valid IANA name`); }

for (const d of config.hours.days) {
  if (!(d.day in JS_DAY)) throw new Error(`hours: unknown day "${d.day}"`);
  if ((d.open === null) !== (d.close === null)) throw new Error(`hours: ${d.day} needs both open and close, or neither`);
  if (d.open && (!TIME.test(d.open) || !TIME.test(d.close))) throw new Error(`hours: ${d.day} times must be HH:MM`);
}

const hoursRows = config.hours.days
  .map((d) => {
    const value = d.open ? `${fmtTime(d.open)} – ${fmtTime(d.close)}` : 'Closed';
    return `<tr data-day="${JS_DAY[d.day]}" data-open="${esc(d.open ?? '')}" data-close="${esc(d.close ?? '')}"><th scope="row">${esc(d.day)}</th><td>${esc(value)}</td></tr>`;
  })
  .join('\n      ');

const hoursTable = (extraClass = '') => `<table class="hours ${extraClass}" data-hours data-tz="${esc(tz)}" data-sample="${config.hours.placeholder ? 'true' : 'false'}">
    <caption class="sr-only">Opening hours</caption>
    <tbody>
      ${hoursRows}
    </tbody>
  </table>`;

// "Open Tuesday to Sunday" from the hours, for the hero's fact line.
const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const openDays = ORDER.filter((n) => config.hours.days.find((d) => d.day === n)?.open);
let hoursSummary = 'Opening hours coming soon';
if (openDays.length === 7) hoursSummary = 'Open every day';
else if (openDays.length) {
  const idx = openDays.map((n) => ORDER.indexOf(n));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  hoursSummary = contiguous && openDays.length > 2 ? `Open ${openDays[0]} to ${openDays.at(-1)}` : `Open ${openDays.join(', ')}`;
}

const socialLinks = config.socials
  .map((s) => {
    const url = httpsUrl(s.url);
    if (url && !s.placeholder) return `<li><a class="link" href="${esc(url)}" rel="noopener noreferrer" target="_blank">${esc(s.name)}<span class="sr-only"> (opens in a new tab)</span></a></li>`;
    return `<li>${ph(esc(s.name), true)}</li>`;
  })
  .join('');

const formUrl = (u) => {
  const url = httpsUrl(u);
  if (!url.startsWith('https://formspree.io/')) throw new Error(`forms: "${u}" must be a https://formspree.io/ URL`);
  return url;
};

const phoneLink = (cls = 'link') =>
  `<a class="${cls}" href="tel:${esc(config.phone.e164)}">${ph(esc(config.phone.display), config.phone.placeholder)}</a>`;

const NAV = [
  { key: 'carry', href: '/what-we-carry/', label: 'What we carry' },
  { key: 'arrivals', href: '/new-arrivals/', label: 'New arrivals' },
  { key: 'holiday', href: '/holiday/', label: 'Holiday & seasonal' },
  { key: 'visit', href: '/visit/', label: 'Visit us' },
  { key: 'about', href: '/about/', label: 'About' },
  { key: 'faq', href: '/faq/', label: 'FAQ' },
  { key: 'contact', href: '/contact/', label: 'Contact' },
];

const navList = (current, keys) =>
  NAV.filter((n) => !keys || keys.includes(n.key))
    .map((n) => `<li><a href="${n.href}"${n.key === current ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`)
    .join('');

// ---------- new arrivals, pre-rendered from the same JSON the page script reads ----------

const arrivals = JSON.parse(await readFile(join(SRC, 'static/assets/data/new-arrivals.json'), 'utf8'));
const SAFE_IMAGE = /^\/assets\/img\/arrivals\/[a-z0-9][a-z0-9-]*\.(svg|png|jpe?g|webp)$/;
const TILES = ['tile--sky', 'tile--blush', 'tile--butter', 'tile--mint', 'tile--peach', 'tile--stone'];
const catLabel = Object.fromEntries(arrivals.categories.map((c) => [c.id, c.label]));
for (const it of arrivals.items) {
  if (!catLabel[it.category]) throw new Error(`new-arrivals: "${it.name}" has unknown category "${it.category}"`);
  if (!SAFE_IMAGE.test(it.image)) throw new Error(`new-arrivals: "${it.name}" image must be a file in /assets/img/arrivals/`);
  if (!it.name || !it.alt) throw new Error('new-arrivals: every item needs a name and alt text');
}
const arrivalCard = (it, i) => `<li class="arrivals-grid__item"><article class="card">${it.sample === true ? '<span class="tag tag--ink card__badge">Sample</span>' : ''}<div class="card__media ${TILES[i % TILES.length]}"><img src="${esc(it.image)}" alt="${esc(it.alt)}" width="400" height="400" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async"></div><div class="card__body"><h3 class="card__title">${esc(it.name)}</h3>${it.note ? `<p class="card__text">${esc(it.note)}</p>` : ''}<div class="card__meta"><span class="card__price">${esc(it.price)}</span><span class="card__cat">${esc(catLabel[it.category])}</span></div></div></article></li>`;
const filterButton = (id, label, count) => `<button class="filter" type="button" data-cat="${esc(id)}" aria-pressed="${id === 'all'}"><span>${esc(label)}</span><span class="filter__count">${count}</span><span class="sr-only">${count === 1 ? ' item' : ' items'}</span></button>`;
const updatedDate = /^\d{4}-\d{2}-\d{2}$/.test(arrivals.updated)
  ? `<time datetime="${arrivals.updated}">${new Date(arrivals.updated + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time>`
  : 'recently';

const baseVars = {
  arrivalsHome: arrivals.items.slice(0, 4).map(arrivalCard).join(''),
  arrivalsAll: arrivals.items.map(arrivalCard).join(''),
  arrivalsFilters: [filterButton('all', 'All', arrivals.items.length), ...arrivals.categories.map((c) => filterButton(c.id, c.label, arrivals.items.filter((i) => i.category === c.id).length))].join(''),
  arrivalsCount: String(arrivals.items.length),
  arrivalsUpdated: updatedDate,
  name: esc(config.name),
  tagline: esc(config.tagline),
  year: String(new Date().getFullYear()),
  addressStreet: ph(esc(a.street), addrPh),
  addressCity: ph(esc(`${a.city}, ${a.region} ${a.postalCode}`), addrPh),
  addressInline: ph(esc(addressText), addrPh),
  addressCityShort: ph(esc(`${a.city}, ${a.region}`), addrPh),
  hoursSummary: ph(esc(hoursSummary), config.hours.placeholder),
  hoursSummaryText: esc(hoursSummary),
  directionsUrl: esc(directionsUrl),
  mapEmbed: esc(mapEmbed),
  mapNote: addrPh ? '<p class="small muted">Until the street address is set, the map searches the shop’s name.</p>' : '',
  phoneLink: phoneLink(),
  phoneTel: esc(config.phone.e164),
  phoneDisplay: ph(esc(config.phone.display), config.phone.placeholder),
  hoursTable: hoursTable(),
  hoursTableCompact: hoursTable('hours--compact'),
  hoursSampleNote: config.hours.placeholder ? '<p class="small muted">' + ph('Sample hours', true) + ' until the real ones are in.</p>' : '',
  socialLinks,
  formContact: esc(formUrl(config.forms.contact)),
  formEmailList: esc(formUrl(config.forms.emailList)),
  formsLive: config.forms.placeholder ? 'false' : 'true',
  privacyDate: esc(new Date(config.privacy.effectiveDate + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })),
  privacyOwner: ph(esc(config.privacy.ownerName.value), config.privacy.ownerName.placeholder),
  robots: preview ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">',
  previewStrip: preview
    ? `<p class="preview-strip">Sample website made for ${esc(config.name)} by ${esc(config.preview.madeBy)}. <span class="preview-strip__ph">Details marked TODO are placeholders.</span></p>`
    : '',
};

// ---------- pages ----------

const partials = {};
for (const f of await readdir(join(SRC, 'partials'))) {
  partials[f.replace(/\.html$/, '')] = await readFile(join(SRC, 'partials', f), 'utf8');
}

function render(template, vars, where) {
  let out = template;
  for (let i = 0; i < 5 && /\{\{>/.test(out); i++) {
    out = out.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => {
      if (!(n in partials)) throw new Error(`${where}: unknown partial "${n}"`);
      return partials[n];
    });
  }
  return out.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, n) => {
    if (!(n in vars)) throw new Error(`${where}: unknown value {{${n}}}`);
    return vars[n];
  });
}

// Catch a broken script before it ships: syntax-check every JS file.
for (const f of await readdir(join(SRC, 'static/assets/js'))) {
  if (f.endsWith('.js')) execFileSync(process.execPath, ['--check', join(SRC, 'static/assets/js', f)], { stdio: 'inherit' });
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(join(SRC, 'static'), DIST, { recursive: true });

const pageFiles = (await readdir(join(SRC, 'pages'))).filter((f) => f.endsWith('.html'));
const sitemap = [];

for (const file of pageFiles) {
  const raw = await readFile(join(SRC, 'pages', file), 'utf8');
  const m = raw.match(/^<!--page\s+([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${file}: missing <!--page {...} --> header`);
  const meta = JSON.parse(m[1]);
  const body = raw.slice(m[0].length);

  const vars = {
    ...baseVars,
    title: esc(meta.title),
    description: esc(meta.description),
    bodyClass: esc(meta.bodyClass ?? ''),
    navMain: navList(meta.nav, ['carry', 'arrivals', 'holiday', 'visit', 'about', 'faq']),
    navAll: navList(meta.nav),
    canonical: preview || meta.path === null ? '' : `<link rel="canonical" href="${esc(config.siteUrl + meta.path)}">`,
    ogUrl: preview || meta.path === null ? '' : `<meta property="og:url" content="${esc(config.siteUrl + meta.path)}">`,
  };

  const html = render(`{{> layout}}`, { ...vars, content: '' }, file).replace('<!--CONTENT-->', () => render(body, vars, file));
  if (/\{\{|\}\}/.test(html)) throw new Error(`${file}: unrendered braces left in output`);
  if (/\sstyle=|\son[a-z]+=|<script(?![^>]*\bsrc=)/i.test(html)) throw new Error(`${file}: inline style, handler or script found (CSP forbids them)`);

  const outPath = meta.path === null ? join(DIST, file) : join(DIST, meta.path, 'index.html');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html);
  if (meta.path !== null && !meta.noSitemap) sitemap.push(meta.path);
}

// sitemap and robots depend on the preview switch
await writeFile(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
    .sort()
    .map((p) => `  <url><loc>${esc(config.siteUrl + p)}</loc></url>`)
    .join('\n')}\n</urlset>\n`
);
await writeFile(
  join(DIST, 'robots.txt'),
  preview
    ? '# Preview build: pages carry noindex, so crawlers are allowed in to read it.\nUser-agent: *\nAllow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`
);

// the preview also says noindex in a header, for files that are not HTML
if (preview) {
  const h = join(DIST, '_headers');
  await writeFile(h, (await readFile(h, 'utf8')).replace('/*\n', '/*\n  X-Robots-Tag: noindex, nofollow\n'));
}

const size = async (p) => (await stat(p)).size;
console.log(`built ${pageFiles.length} pages into dist/ (${preview ? 'preview, noindex' : 'launch, indexable'}); index.html ${await size(join(DIST, 'index.html'))} bytes`);
