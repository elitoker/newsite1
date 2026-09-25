// Search the Cleveland Museum of Art's Open Access API (no key needed).
// Everything it returns with cc0=1 is public domain with a full image.
//
// Museum image servers don't send the CORS header WebGL needs to use an image
// as a texture, so images go through wsrv.nl, a free image relay that adds it.
// (The Art Institute of Chicago was the first source, but its image server
// now blocks browsers and relays alike.)

const API = 'https://openaccess-api.clevelandart.org/api/artworks/';

export const relay = (url, width) =>
  `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&we&output=jpg`;

// "Claude Monet (French, 1840–1926)" -> "Claude Monet"
const artistName = c => (c?.description || '').replace(/\s*\(.*$/, '').trim();

function catalogDims(a) {
  const d = a.dimensions?.unframed || a.dimensions?.framed;
  if (!d?.height || !d?.width) return {};
  const h = d.height * 100, w = d.width * 100;
  if (h < 2 || w < 2 || h > 1500 || w > 1500) return {};
  return { hCm: h, wCm: w };
}

export async function searchCollection(q, { paintingsOnly = true } = {}) {
  const p = new URLSearchParams({ q, has_image: '1', cc0: '1', limit: '60' });
  if (paintingsOnly) p.set('type', 'Painting');
  const res = await fetch(API + '?' + p);
  if (!res.ok) throw new Error('Search failed: ' + res.status);
  const json = await res.json();
  return (json.data || [])
    .filter(a => a.images?.web?.url)
    .map(a => {
      const web = a.images.web, big = a.images.print || web;
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
        ...catalogDims(a),
      };
    });
}
