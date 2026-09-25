// What an artist's avatar can truthfully say on a tour.
//   About themselves: facts from Wikidata (birthplace, movement, teachers, influences)
//   and the opening of their Wikipedia article.
//   About each work: the museum's own wall text (Cleveland) or the painting's
//   Wikipedia article (works found through Wikidata).
// Third-person text is turned into the artist's voice: "Monet kept it" -> "I kept it".
// Nothing is invented. When there's no text, the avatar talks about what you can see.

import { RAQUEL_VOICE } from './voices.js';

const WD = 'https://www.wikidata.org/w/api.php';
const WP = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const CMA = 'https://openaccess-api.clevelandart.org/api/artworks/';
const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make().catch(() => null)); return cache.get(key); };
const json = url => fetch(url).then(r => (r.ok ? r.json() : null));
const strip = html => (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const sentences = t => (t.match(/[^.!?]+[.!?]+(\s|$)/g) || [t]).map(s => s.trim()).filter(Boolean);
const list = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

/* ---------------------------------------------------------------- first person */
// Rewrites sentences that talk about the artist so the artist is speaking.
// Pronouns (he/she/his/her) are only changed in sentences that name the artist,
// and only the ones matching the artist's gender, so "her face" in a portrait stays put.
// all: the whole text is about the artist (their own biography), so every matching
// pronoun is theirs. Otherwise only sentences that name them, or start with He/She
// right after one that did.
export function inVoice(text, name, gender, { all = false } = {}) {
  const parts = name.replace(/[.,]/g, '').split(/\s+/).filter(Boolean);
  const last = parts.pop();
  if (!last || last.length < 3) return text;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Only the artist's own names count; "Madame Monet" or "Camille Monet" is someone else
  const first = parts.length ? `(?:(?:${parts.map(esc).join('|')})\\s+)*` : '';
  const src = `(?<![A-Z][\\w'’]*\\s)(?:[A-Z][\\w'’]*-)?${first}${esc(last)}\\b`;
  const nameRe = new RegExp(src);
  const pro = gender === 'female'
    ? [[/\bshe\b/g, 'I'], [/\bShe\b/g, 'I'], [/\bherself\b/gi, 'myself'], [/\bher\b(?=\s+[a-z])/g, 'my'], [/\bHer\b(?=\s+[a-z])/g, 'My'], [/\bher\b/g, 'me']]
    : gender === 'male'
      ? [[/\bhe\b/g, 'I'], [/\bHe\b/g, 'I'], [/\bhimself\b/gi, 'myself'], [/\bhis\b/g, 'my'], [/\bHis\b/g, 'My'], [/\bhim\b/g, 'me']]
      : [];
  const SUBJECT = /^\s+(?:was|is|had|has|made|painted|kept|wrote|returned|moved|used|began|lived|spent|visited|loved|often|also|first|later|then|would|could|did|went|worked|traveled|travelled|studied|created|chose|wanted|saw|found|became|continued|developed|exhibited|sold|gave|left|joined|met|married|described|called|said|believed|felt|took|depicted|captured|\w+ed)\b/;
  const startsWithThem = gender === 'female' ? /^She\b/ : gender === 'male' ? /^He\b/ : /^$^/;
  let prev = false;
  return sentences(text).map(s => {
    const named = nameRe.test(s);
    const follows = !named && (all || (prev && startsWithThem.test(s)));
    prev = named || follows;
    if (!named && !follows) return s;
    let out = s.replace(new RegExp(src + '[\'’]s', 'g'), 'my');
    out = out.replace(new RegExp(src, 'g'), (m, offset, whole) => {
      const before = whole.slice(0, offset), after = whole.slice(offset + m.length);
      const lead = /(^|[,;:]\s*|\b(?:and|that|when|where|because|as|while|after|before|until|which|so|then)\s+)$/.test(before);
      return lead || SUBJECT.test(after) ? 'I' : 'me';
    });
    for (const [re, to] of pro) out = out.replace(re, to);
    return out
      .replace(/\bI is\b/g, 'I am').replace(/\bI has\b/g, 'I have').replace(/\bI does\b/g, 'I do')
      .replace(/^my\b/, 'My').replace(/^me\b/, 'Me');
  }).join(' ');
}

/* ---------------------------------------------------------------- the artist */
async function wdEntities(ids, props) {
  if (!ids.length) return {};
  const p = new URLSearchParams({ action: 'wbgetentities', ids: ids.slice(0, 50).join('|'), props, languages: 'en', format: 'json', origin: '*' });
  return (await json(WD + '?' + p))?.entities || {};
}
const claimIds = (e, p) => (e.claims?.[p] || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
const claimYear = (e, p) => { const t = e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value?.time; return t ? t.slice(1, 5).replace(/^0+/, '') : ''; };

export function artistInfo(name) {
  return once('artist|' + name, async () => {
    if (name === 'Raquel Weinberg') {
      return { name, gender: 'female', intro: RAQUEL_VOICE.intro ? [RAQUEL_VOICE.intro] : ['I studied painting at Pratt.'], likes: [] };
    }
    const found = await json(WD + '?' + new URLSearchParams({ action: 'wbsearchentities', search: name, language: 'en', type: 'item', limit: '5', format: 'json', origin: '*' }));
    const hit = (found?.search || []).find(s => /paint|artist|sculpt|print|draughts|illustrat|photograph/i.test(s.description || '')) || found?.search?.[0];
    if (!hit) return { name, gender: null, intro: [], likes: [] };
    const e = (await wdEntities([hit.id], 'claims|sitelinks|descriptions'))[hit.id] || {};
    const gender = claimIds(e, 'P21')[0] === 'Q6581072' ? 'female' : claimIds(e, 'P21')[0] === 'Q6581097' ? 'male' : null;
    const refs = ['P19', 'P135', 'P1066', 'P737'].flatMap(p => claimIds(e, p).slice(0, 4));
    const labels = await wdEntities([...new Set(refs)], 'labels');
    const label = id => labels[id]?.labels?.en?.value;
    const born = label(claimIds(e, 'P19')[0]), year = claimYear(e, 'P569');
    const movements = claimIds(e, 'P135').map(label).filter(Boolean).slice(0, 2);
    const teachers = claimIds(e, 'P1066').map(label).filter(Boolean).slice(0, 2);
    const influences = claimIds(e, 'P737').map(label).filter(Boolean).slice(0, 3);

    const intro = [];
    const title = e.sitelinks?.enwiki?.title;
    if (title) {
      const sum = await json(WP + encodeURIComponent(title.replace(/ /g, '_')));
      const first = sentences((sum?.extract || '').replace(/\s*\([^)]*\)/g, '')).slice(0, 2).join(' ');
      // Articles open with the full name, sometimes with asides: "Mary Stevenson Cassatt was",
      // "Vilhelm Hammershøi, often anglicised as ..., was". That whole opening becomes "I was".
      const last = name.split(/\s+/).pop();
      const opened = first.replace(/^(.{0,140}?)\s(was|is)\s/, (m, pre, v) => (pre.includes(last) ? `I ${v === 'is' ? 'am' : 'was'} ` : m));
      if (opened) intro.push(inVoice(opened, name, gender, { all: true }));
    }
    if (born && year) intro.push(`I was born in ${born} in ${year}.`);
    if (movements.length) intro.push(`My work belongs to ${list(movements)}.`);
    const likes = [];
    if (teachers.length) likes.push(`I studied with ${list(teachers)}.`);
    if (influences.length) likes.push(`I learned a great deal from ${list(influences)}. Their work stayed with me.`);
    return { name, gender, intro, likes };
  });
}

/* ---------------------------------------------------------------- the work */
// Cleveland's single-record address doesn't allow browsers, but its search does
async function cmaText(w) {
  if (w.about) return w.about;
  const p = new URLSearchParams({ q: w.title, artists: w.artist, limit: '10' });
  const found = (await json(CMA + '?' + p))?.data || [];
  const a = found.find(x => String(x.id) === String(w.sourceId)) || found[0];
  if (!a) return '';
  return [strip(a.did_you_know), strip(a.description)].filter(Boolean).join(' ');
}
async function wikiText(qid) {
  const e = (await wdEntities([qid], 'sitelinks|descriptions'))[qid];
  const title = e?.sitelinks?.enwiki?.title;
  if (title) {
    const sum = await json(WP + encodeURIComponent(title.replace(/ /g, '_')));
    if (sum?.extract) return sum.extract;
  }
  return '';
}

// Things you can point at in any painting, used when nothing is written about it
const LOOK = [
  [/water|sea|river|harbou?r|boat|lake|bridge|wave/i, 'Look at how the water is made: it\'s only a few colors laid side by side, but it moves.'],
  [/portrait|woman|man\b|girl|boy|lady|madame|self/i, 'Look at the face first, then the hands. The hands often tell you more.'],
  [/flower|garden|bouquet|still life|fruit/i, 'Step in close to see the brushwork, then step back and watch it turn into petals.'],
  [/snow|winter/i, 'Snow is never just white. Try to count the colors in it.'],
  [/night|moon|evening/i, 'Give your eyes a moment here. Night paintings reveal themselves slowly.'],
  [/landscape|view|field|forest|tree|mountain/i, 'Find where the light is coming from, then follow it across the land.'],
];
export function lookLine(w) {
  const hit = LOOK.find(([re]) => re.test(w.title + ' ' + w.medium));
  return hit ? hit[1] : 'Take your time with this one. Notice what your eye goes to first, and what it finds second.';
}

// Everything the artist says at one work, as short lines
export function workLines(w, info) {
  return once('work|' + w.source + '|' + w.sourceId + '|' + w.title, async () => {
    const lines = [`This is ${w.title}${w.date ? `, from ${w.date}` : ''}.${w.medium ? ` ${cap(w.medium)}.` : ''}`];
    let about = '';
    if (w.artist === 'Raquel Weinberg') about = RAQUEL_VOICE.works[w.title] || '';
    else if (w.source === 'Cleveland Museum of Art') about = await cmaText(w);
    else if (w.source === 'Wikimedia Commons' && /^Q\d+$/.test(w.sourceId)) about = await wikiText(w.sourceId);
    if (about && w.artist !== 'Raquel Weinberg') about = inVoice(about, w.artist, info?.gender);
    // Keep it to a few sentences per stop
    const parts = sentences(about).slice(0, 4);
    for (let i = 0; i < parts.length; i += 2) lines.push(parts.slice(i, i + 2).join(' '));
    if (!about) lines.push(lookLine(w));
    return lines;
  }).then(l => l || [`This is ${w.title}.`, lookLine(w)]);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
