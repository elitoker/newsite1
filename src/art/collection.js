// Art sources. Everything here is public domain with a full image:
//   Cleveland Museum of Art Open Access (cc0), the Met's open API, and
//   Wikidata + Wikimedia Commons, which covers thousands of lesser-known artists.
// Plus Raquel Weinberg's own work (raquel.js).
//
// Museum image servers don't send the CORS header WebGL needs to use an image
// as a texture, so Cleveland and Met images go through wsrv.nl, a free image relay
// that adds it. Commons and Raquel's site send it themselves.
// (The Art Institute of Chicago was the first source, but its image server
// now blocks browsers and relays alike.)

import { RAQUEL, isRaquelQuery } from './raquel.js';

const API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const MET = 'https://collectionapi.metmuseum.org/public/collection/v1/';

export const relay = (url, width) =>
  `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&we&output=jpg`;

const okDims = (h, w) => (h > 2 && w > 2 && h < 1500 && w < 1500 ? { hCm: h, wCm: w } : {});

// "Claude Monet (French, 1840–1926)" -> "Claude Monet"
const artistName = c => (c?.description || '').replace(/\s*\(.*$/, '').trim();

function cmaWork(a) {
  const web = a.images.web, big = a.images.print || web;
  const d = a.dimensions?.unframed || a.dimensions?.framed;
  return {
    source: 'Cleveland Museum of Art',
    sourceId: a.id,
    title: a.title || 'Untitled',
    artist: artistName(a.creators?.[0]) || a.culture?.[0] || 'Unknown artist',
    date: a.creation_date || '',
    medium: a.technique || '',
    thumb: relay(web.url, 240),
    src: relay(big.url, 1600),
    aspect: web.width && web.height ? +web.width / +web.height : 1,
    ...(d?.height && d?.width ? okDims(d.height * 100, d.width * 100) : {}),
  };
}

// "25 5/8 x 32 in. (65.1 x 81.3 cm)" -> the first "a x b cm" pair
function metWork(o) {
  const m = /([\d.]+)\s*[×x]\s*([\d.]+)\s*cm/.exec(o.dimensions || '');
  const d = m ? okDims(+m[1], +m[2]) : {};
  return {
    source: 'The Metropolitan Museum of Art',
    sourceId: o.objectID,
    title: o.title || 'Untitled',
    artist: o.artistDisplayName || o.culture || 'Unknown artist',
    date: o.objectDate || '',
    medium: o.medium || '',
    thumb: relay(o.primaryImageSmall, 240),
    src: relay(o.primaryImage || o.primaryImageSmall, 1600),
    ...d,
    aspect: d.hCm ? d.wCm / d.hCm : 0,   // 0 means measure it from the image
  };
}

// Plain keyword search of Cleveland (used for themed shows)
export async function searchCollection(q, { paintingsOnly = true } = {}) {
  if (isRaquelQuery(q)) return RAQUEL.map(w => ({ ...w }));
  return cleveland({ q }, paintingsOnly);
}

// Keyword search of the Met
export async function searchMet(q, { limit = 30, paintingsOnly = true } = {}) {
  const p = new URLSearchParams({ q, hasImages: 'true' });
  if (paintingsOnly) p.set('medium', 'Paintings');
  const ids = ((await fetch(MET + 'search?' + p).then(r => r.json())).objectIDs || []).slice(0, limit * 2);
  const objs = await Promise.all(ids.map(id => fetch(MET + 'objects/' + id).then(r => (r.ok ? r.json() : null)).catch(() => null)));
  return objs.filter(o => o && o.isPublicDomain && o.primaryImageSmall).slice(0, limit).map(metWork);
}

/* ---------------------------------------------------------------- Wikidata + Commons */
// Wikidata knows thousands of lesser-known painters; Wikimedia Commons hosts public
// domain photos of their work. Both allow browsers to load from them directly.
const WD = 'https://query.wikidata.org/sparql';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const UNIT_CM = { Q174728: 1, Q11573: 100, Q174789: 0.1, Q218593: 2.54 };
const unitCm = uri => UNIT_CM[(uri || '').split('/').pop()] ?? null;

async function commonsImages(files) {
  const out = {};
  for (let i = 0; i < files.length; i += 50) {
    const p = new URLSearchParams({
      action: 'query', prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: '1600', format: 'json', origin: '*',
      titles: files.slice(i, i + 50).map(f => 'File:' + f).join('|'),
    });
    const j = await fetch(COMMONS + '?' + p).then(r => r.json());
    const norm = Object.fromEntries((j.query?.normalized || []).map(n => [n.to, n.from]));
    for (const pg of Object.values(j.query?.pages || {})) {
      const ii = pg.imageinfo?.[0];
      if (!ii?.thumburl) continue;
      const key = (norm[pg.title] || pg.title).replace(/^File:/, '');
      out[key] = { src: ii.thumburl, thumb: ii.thumburl.replace(/\/(lossy-page1-)?\d+px-/, '/$1330px-'), aspect: ii.width / ii.height };
    }
  }
  return out;
}

export async function searchWikidata(q, { paintingsOnly = true, limit = 40 } = {}) {
  const name = q.replace(/["\\]/g, '').trim();
  const sparql = `SELECT ?item ?itemLabel ?creatorLabel ?image ?inception ?h ?hu ?w ?wu ?materialLabel WHERE {
    SERVICE wikibase:mwapi { bd:serviceParam wikibase:api "EntitySearch"; wikibase:endpoint "www.wikidata.org";
      mwapi:search "${name}"; mwapi:language "en"; mwapi:limit "3". ?creator wikibase:apiOutputItem mwapi:item. }
    ?item wdt:P170 ?creator; wdt:P18 ?image.
    ${paintingsOnly ? '?item wdt:P31 wd:Q3305213.' : ''}
    OPTIONAL { ?item wdt:P571 ?inception }
    OPTIONAL { ?item p:P2048/psv:P2048 [ wikibase:quantityAmount ?h; wikibase:quantityUnit ?hu ] }
    OPTIONAL { ?item p:P2049/psv:P2049 [ wikibase:quantityAmount ?w; wikibase:quantityUnit ?wu ] }
    OPTIONAL { ?item wdt:P186 ?material }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 160`;
  const res = await fetch(WD + '?' + new URLSearchParams({ query: sparql, format: 'json' }));
  if (!res.ok) throw new Error('Wikidata failed');
  const rows = (await res.json()).results.bindings;
  const items = new Map();
  for (const r of rows) {
    const id = r.item.value;
    if (!items.has(id)) {
      const file = decodeURIComponent(r.image.value.split('/Special:FilePath/')[1] || '');
      const hk = unitCm(r.hu?.value), wk = unitCm(r.wu?.value);
      const title = r.itemLabel?.value || 'Untitled';
      items.set(id, {
        file, title: /^Q\d+$/.test(title) ? 'Untitled' : title,
        artist: r.creatorLabel?.value || 'Unknown artist',
        date: r.inception?.value?.slice(0, 4).replace(/^-?0+/, '') || '',
        materials: new Set(),
        hCm: r.h && hk ? +r.h.value * hk : null, wCm: r.w && wk ? +r.w.value * wk : null,
        sourceId: id.split('/').pop(),
      });
    }
    if (r.materialLabel?.value) items.get(id).materials.add(r.materialLabel.value);
    if (items.size >= limit * 1.5) break;
  }
  const list = [...items.values()].filter(i => i.file).slice(0, limit);
  const imgs = await commonsImages(list.map(i => i.file));
  return list.filter(i => imgs[i.file]).map(i => {
    const img = imgs[i.file];
    const dims = i.hCm > 2 && i.wCm > 2 && i.hCm < 1500 && i.wCm < 1500 ? { hCm: i.hCm, wCm: i.wCm } : {};
    return {
      source: 'Wikimedia Commons', sourceId: i.sourceId,
      title: i.title, artist: i.artist, date: i.date, medium: [...i.materials].join(', '),
      thumb: img.thumb, src: img.src, aspect: img.aspect, ...dims,
    };
  });
}

/* ---------------------------------------------------------------- one search box for everything */
// Lowercase without accents; letters that don't decompose (ø, æ, ß...) are spelled out
const SPELL = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };
const MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');   // combining accents
const fold = s => (s || '').toLowerCase().normalize('NFD').replace(MARKS, '').replace(/[øæœßłđðþı]/g, c => SPELL[c]);

async function cleveland(params, paintingsOnly) {
  const p = new URLSearchParams({ has_image: '1', cc0: '1', limit: '60', ...params });
  if (paintingsOnly) p.set('type', 'Painting');
  const json = await fetch(API + '?' + p).then(r => r.json());
  return (json.data || []).filter(a => a.images?.web?.url).map(cmaWork);
}

async function metByArtist(q, paintingsOnly) {
  const p = new URLSearchParams({ q, hasImages: 'true', artistOrCulture: 'true' });
  const ids = ((await fetch(MET + 'search?' + p).then(r => r.json())).objectIDs || []).slice(0, 40);
  const objs = await Promise.all(ids.map(id => fetch(MET + 'objects/' + id).then(r => (r.ok ? r.json() : null)).catch(() => null)));
  return objs
    .filter(o => o && o.isPublicDomain && o.primaryImageSmall && (!paintingsOnly || /paint/i.test(o.classification + ' ' + o.medium)))
    .map(metWork);
}

// Works by the artist come first, from every source; then anything else that mentions the words.
// Works by the artist come first, from every source; then anything else that mentions
// the words. onUpdate is called each time a source answers, so fast sources show at once.
export async function searchArt(q, { paintingsOnly = true, onUpdate = null } = {}) {
  q = q.trim();
  if (isRaquelQuery(q)) {
    const r = { byArtist: RAQUEL.map(w => ({ ...w })), other: [], artistName: 'Raquel Weinberg', done: true };
    onUpdate?.(r);
    return r;
  }
  const tokens = fold(q).split(/\s+/).filter(t => t.length >= 3);
  const isBy = w => tokens.length > 0 && tokens.every(t => fold(w.artist).includes(t));
  const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  const got = { cma: [], met: [], wd: [], any: [] };
  let pending = 4, failures = 0;

  const combine = () => {
    const seen = new Set();
    const uniq = list => list.filter(w => {
      const k = fold(w.title).replace(/\W/g, '') + '|' + fold(w.artist).split(' ').pop();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const byArtist = uniq([...got.cma, ...got.met.filter(isBy), ...got.wd.filter(isBy)]);
    const other = uniq([...got.any, ...got.wd, ...got.met]).filter(w => !isBy(w));
    return { byArtist, other, artistName: byArtist[0]?.artist || '', done: pending === 0, failed: pending === 0 && failures === 4 };
  };
  const run = (key, p) => timeout(p, 25000)
    .then(list => { got[key] = list; }, () => { failures++; })
    .finally(() => { pending--; onUpdate?.(combine()); });

  await Promise.all([
    run('cma', cleveland({ artists: q }, paintingsOnly)),
    run('met', metByArtist(q, paintingsOnly)),
    run('wd', searchWikidata(q, { paintingsOnly })),
    run('any', cleveland({ q }, paintingsOnly)),
  ]);
  return combine();
}

// For sources that don't give proportions, read them from the thumbnail
export function measureAspect(w) {
  if (w.aspect) return Promise.resolve(w);
  return new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res({ ...w, aspect: img.naturalWidth / img.naturalHeight || 1 });
    img.onerror = () => res({ ...w, aspect: 1 });
    img.src = w.thumb;
  });
}
