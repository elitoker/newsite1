// Search the Art Institute of Chicago's open API (no key needed).
// Only public domain works come back with full images.

function catalogDims(a) {
  const d = Array.isArray(a.dimensions_detail) ? a.dimensions_detail.find(x => x && x.width && x.height) : null;
  let h, w;
  if (d) { h = d.height; w = d.width; }
  else {
    const m = /([\d.]+)\s*[×x]\s*([\d.]+)\s*cm/.exec(a.dimensions || '');
    if (m) { h = +m[1]; w = +m[2]; }
  }
  if (!h || !w || h < 2 || w < 2 || h > 1500 || w > 1500) return {};
  return { hCm: h, wCm: w };
}

export async function searchCollection(q, { paintingsOnly = true } = {}) {
  const p = new URLSearchParams({
    q, limit: '60',
    fields: 'id,title,artist_title,date_display,image_id,thumbnail,dimensions,dimensions_detail,medium_display,artwork_type_title',
  });
  p.set('query[term][is_public_domain]', 'true');
  const res = await fetch('https://api.artic.edu/api/v1/artworks/search?' + p);
  if (!res.ok) throw new Error('Search failed: ' + res.status);
  const json = await res.json();
  const iiif = json.config?.iiif_url || 'https://www.artic.edu/iiif/2';
  return (json.data || [])
    .filter(a => a.image_id && (!paintingsOnly || /paint/i.test(a.artwork_type_title || '')))
    .map(a => ({
      source: 'Art Institute of Chicago',
      sourceId: a.id,
      title: a.title || 'Untitled',
      artist: a.artist_title || 'Unknown artist',
      date: a.date_display || '',
      medium: a.medium_display || '',
      thumb: `${iiif}/${a.image_id}/full/200,/0/default.jpg`,
      src: `${iiif}/${a.image_id}/full/843,/0/default.jpg`,
      aspect: a.thumbnail?.width && a.thumbnail?.height ? a.thumbnail.width / a.thumbnail.height : 1,
      ...catalogDims(a),
    }));
}
