import { state, newId } from '../state.js';
import { CENTERLINE } from '../config.js';
import { building } from '../world/building.js';
import { outerSize } from '../art/works.js';
import { searchCollection, searchArt, measureAspect } from '../art/collection.js';
import { RAQUEL } from '../art/raquel.js';

// Filling walls automatically: pick a theme, gather works, hang them evenly.

export const THEMES = [
  { title: 'Light on Water', queries: ['water', 'river', 'sea', 'harbor', 'boats'] },
  { title: 'Faces of the Past', queries: ['portrait of a woman', 'portrait of a man', 'portrait'] },
  { title: 'The Impressionist Eye', queries: ['Monet', 'Renoir', 'Pissarro', 'Sisley', 'Degas', 'Morisot'] },
  { title: 'Gardens and Flowers', queries: ['flowers', 'garden', 'bouquet'] },
  { title: 'The Dutch Golden Age', queries: ['Rembrandt', 'Dutch', 'Hals', 'Ruisdael', 'Steen'] },
  { title: 'American Landscapes', queries: ['Hudson River', 'Inness', 'Homer', 'Church', 'Bierstadt'] },
  { title: 'Still Life', queries: ['still life', 'fruit', 'vanitas'] },
  { title: 'Night and Moonlight', queries: ['moonlight', 'night', 'evening'] },
  { title: 'City Life', queries: ['street', 'Paris', 'Venice', 'city'] },
  { title: 'Myth and Legend', queries: ['Venus', 'mythology', 'Diana', 'Apollo'] },
  { title: 'Snow and Winter', queries: ['snow', 'winter'] },
  { title: 'Raquel Weinberg: New Work', queries: ['raquel'] },
];

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Collect up to `want` works for a list of searches, without duplicates
export async function gather(queries, want, { artist = false } = {}) {
  const found = [];
  const seen = new Set();
  const add = list => {
    for (const w of list) {
      const k = (w.title + '|' + w.artist).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      found.push(w);
    }
  };
  if (queries.some(q => /raquel|weinberg/i.test(q))) add(RAQUEL);
  const rest = queries.filter(q => !/raquel|weinberg/i.test(q));
  const results = await Promise.allSettled(rest.map(q => (artist ? searchArt(q).then(r => r.byArtist) : searchCollection(q))));
  // Interleave the searches so no one query dominates the show
  const lists = results.map(r => shuffle(r.value || []));
  for (let i = 0; lists.some(l => l[i]); i++) add(lists.map(l => l[i]).filter(Boolean));
  const picked = found.slice(0, want);
  return Promise.all(picked.map(measureAspect));
}

// How many works the building can take at a comfortable spacing
export function capacity() {
  let total = 0;
  for (const f of building.faces.values()) if (f.len >= 1.6) total += Math.floor(f.len / 3);
  return total;
}

// Hang works face by face: longest walls of the entrance room first, evenly spaced,
// centered on the wall, at eye level. Faces that already have work are left alone.
export function autoHang(works) {
  const L = building.layout;
  const busy = new Set(state.works.map(w => w.faceId));
  const start = L.start.room;
  const faces = [...building.faces.values()]
    .filter(f => f.len >= 1.6 && !busy.has(f.id))
    .sort((a, b) => (b.room === start) - (a.room === start) || b.len - a.len);
  const queue = [...works];
  let hung = 0;
  for (const f of faces) {
    if (!queue.length) break;
    const margin = 0.6, room = f.len - margin * 2, top = f.maxY ?? L.h;
    const chosen = [];
    let used = 0;
    for (let i = 0; i < queue.length && chosen.length < 5;) {
      const { W, H } = outerSize(queue[i]);
      if (H > top - 0.6 || W > room) { i++; continue; }
      const need = used + (chosen.length ? 0.8 : 0) + W;
      if (need > room) break;
      chosen.push(queue.splice(i, 1)[0]);
      used = need;
    }
    if (!chosen.length) continue;
    const sumW = chosen.reduce((s, w) => s + outerSize(w).W, 0);
    const n = chosen.length;
    const gap = n > 1 ? Math.min(2.4, (room - sumW) / (n - 1 + 1.4)) : 0;
    let x = -(sumW + gap * (n - 1)) / 2;
    for (const w of chosen) {
      const { W, H } = outerSize(w);
      const v = Math.min(Math.max(CENTERLINE, H / 2 + 0.35), top - H / 2 - 0.2);
      state.works.push({ ...w, id: newId(), faceId: f.id, u: x + W / 2, v });
      x += W + gap;
      hung++;
    }
  }
  return hung;
}

// Replace the show: current works go to storage, then the walls fill with the theme
export async function fillShow({ theme = null, queries = null, title = null, artist = false, replace = true } = {}) {
  const t = theme || (queries ? { title, queries } : THEMES[Math.floor(Math.random() * THEMES.length)]);
  const works = await gather(t.queries, Math.min(48, capacity()), { artist });
  if (!works.length) return { hung: 0, title: t.title };
  if (replace) {
    for (const { faceId, u, v, id, ...rest } of state.works) state.storage.push(rest);
    state.works = [];
  }
  const hung = autoHang(works);
  state.showTitle = t.title;
  return { hung, title: t.title };
}
